#!/bin/zsh
# 맥에 설치: 웹 화면 빌드, 메뉴 막대 앱 빌드, 로그인 시 자동 실행 등록
# 다시 실행하면 최신 코드로 다시 빌드·재시작한다.
set -eu
REPO="${0:A:h:h}"
APP="$HOME/Applications/QuickTodo.app"
# 로그인 시 실행되는 프로그램은 '문서' 폴더를 읽을 수 없어서, 실행용 사본을 여기에 둔다
RUN="$HOME/Library/Application Support/ai-todo"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/ai-todo"
UID_="$(id -u)"
mkdir -p "$AGENTS" "$LOGS" "$HOME/Applications" "$RUN"

echo "1/4 웹 화면 빌드"
LOCAL_APP=1 VITE_API_URL=http://localhost:8000 npm --prefix "$REPO/frontend" run build --silent >/dev/null

echo "2/4 실행용 사본 만들기 ($RUN)"
rsync -a --delete --exclude .venv --exclude __pycache__ --exclude tests --exclude '*.db' --exclude .pytest_cache \
  "$REPO/backend/" "$RUN/backend/"
rsync -a --delete "$REPO/frontend/dist/" "$RUN/web/"
cp "$REPO/docker-compose.yml" "$REPO/mac/run-backend.sh" "$RUN/"
chmod +x "$RUN/run-backend.sh"
# 개발용 가상환경과 같은 파이썬으로 실행용 가상환경을 만든다 (맥 기본 python3는 3.9라 안 됨)
PY="$("$REPO/backend/.venv/bin/python" -c 'import sys; print(sys._base_executable)')"
[ -x "$RUN/backend/.venv/bin/python" ] || "$PY" -m venv "$RUN/backend/.venv"
"$RUN/backend/.venv/bin/pip" install -q --disable-pip-version-check -r "$RUN/backend/requirements.txt"

echo "3/4 메뉴 막대 앱 빌드"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$REPO/mac/QuickTodo/Info.plist" "$APP/Contents/Info.plist"
# 앱 아이콘: 웹 아이콘(512px)에서 크기별로 만들어 icns로 묶는다
ICONSET="$(mktemp -d)/AppIcon.iconset"; mkdir -p "$ICONSET" "$APP/Contents/Resources"
for size in 16 32 128 256 512; do
  sips -z $size $size "$REPO/frontend/public/icon-512.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
swiftc -O "$REPO/mac/QuickTodo/main.swift" -o "$APP/Contents/MacOS/QuickTodo"
codesign --force --sign - "$APP" >/dev/null 2>&1

echo "4/4 로그인 시 자동 실행 등록"
agent() { # label, program..., keepalive
  local label=$1 keep=$2; shift 2
  local args=""
  for a in "$@"; do args+="<string>$a</string>"; done
  cat > "$AGENTS/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>$args</array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>$keep
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGS/$label.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$label.log</string>
</dict></plist>
PLIST
  # 내리는 건 비동기라, 완전히 사라진 뒤에 다시 등록해야 한다
  launchctl bootout "gui/$UID_/$label" 2>/dev/null || true
  for _ in {1..50}; do launchctl print "gui/$UID_/$label" >/dev/null 2>&1 || break; sleep 0.2; done
  launchctl bootstrap "gui/$UID_" "$AGENTS/$label.plist"
}
agent local.ai-todo.backend "<true/>" /bin/zsh "$RUN/run-backend.sh"
# 메뉴에서 '종료'하면(정상 종료) 다시 켜지 않는다
agent local.ai-todo.quickadd "<dict><key>SuccessfulExit</key><false/></dict>" "$APP/Contents/MacOS/QuickTodo"

echo "완료: ⌘⇧D 로 입력창, 메뉴 막대 체크 아이콘, Launchpad·Spotlight에서 '할 일' 앱"
echo "로그: $LOGS"
