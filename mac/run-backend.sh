#!/bin/zsh
# LaunchAgent가 로그인 때 실행: Docker(Postgres·Redis)를 켜고 백엔드 + 웹 화면을 8000에서 띄운다.
# install.sh가 이 파일을 ~/Library/Application Support/ai-todo 로 복사해서 거기서 실행한다
# (로그인 시 실행되는 프로그램은 '문서' 폴더를 읽을 수 없다).
set -u
HERE="${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

if ! docker info >/dev/null 2>&1; then
  open -ga Docker
  for _ in {1..90}; do docker info >/dev/null 2>&1 && break; sleep 2; done
fi
# 프로젝트 이름을 고정해야 개발할 때 쓰던 것과 같은 컨테이너·데이터를 쓴다
docker compose -p ai-todo-assistant -f "$HERE/docker-compose.yml" up -d postgres redis

cd "$HERE/backend"
export WEB_DIST="$HERE/web"
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
