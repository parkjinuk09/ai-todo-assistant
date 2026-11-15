#!/bin/zsh
# 자동 실행 해제 + 메뉴 막대 앱 삭제 (할 일 데이터는 그대로)
set -u
UID_="$(id -u)"
for label in local.ai-todo.quickadd local.ai-todo.backend; do
  launchctl bootout "gui/$UID_/$label" 2>/dev/null
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
rm -rf "$HOME/Applications/QuickTodo.app" "$HOME/Library/Application Support/ai-todo"
echo "제거 완료 (Docker 컨테이너와 데이터는 남겨 둠)"
