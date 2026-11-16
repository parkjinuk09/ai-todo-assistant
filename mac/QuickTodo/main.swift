// 할 일 — 맥 앱 (메뉴 막대 + 빠른 추가 + 할 일 창)
// ⌘⇧D: 화면 위쪽에 반투명 입력창 → Enter: 창은 바로 닫히고, 비서(/chat)가 처리하면 맥 알림으로 결과
//        제목을 치면 아래에 기존 할 일이 뜬다 → ↓로 고르고 Enter 완료 / ⌘⌫ 삭제 / Tab 제목 수정
// 마감 알림: 마감 10분 전에 맥 알림, 아침에는 오늘 할 일 요약
// 메뉴 막대 아이콘: 밀린 일·오늘 할 일 (누르면 완료), 할 일 창 열기, 종료
// 할 일 창: 웹 화면(할 일·캘린더·월간 기록·비서)을 브라우저 없이 독립 창으로. 열려 있는 동안만 Dock에 보인다

import Carbon.HIToolbox
import Cocoa
import UserNotifications
import WebKit

let api = URL(string: ProcessInfo.processInfo.environment["TODO_API"] ?? "http://127.0.0.1:8000")!
let webURL = URL(string: ProcessInfo.processInfo.environment["TODO_WEB"] ?? "http://localhost:8000/")!

// MARK: - 서버

struct Todo: Decodable {
    let id: Int
    let title: String
    let done: Bool
    let due_at: String?
    let all_day: Bool?

    var due: Date? {
        guard let s = due_at else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
}

enum Server {
    static func request(_ path: String, method: String = "GET", body: [String: Any]? = nil, timeout: TimeInterval = 10,
                        done: @escaping (Result<Data, Error>) -> Void) {
        var req = URLRequest(url: api.appendingPathComponent(path))
        req.httpMethod = method
        req.timeoutInterval = timeout
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        URLSession.shared.dataTask(with: req) { data, resp, err in
            DispatchQueue.main.async {
                if let err { return done(.failure(err)) }
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                let data = data ?? Data()
                if code >= 400 {
                    let detail = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["detail"] as? String
                    return done(.failure(NSError(domain: "todo", code: code,
                                                 userInfo: [NSLocalizedDescriptionKey: detail ?? "요청 실패 (\(code))"])))
                }
                done(.success(data))
            }
        }.resume()
    }
}

// MARK: - 알림

enum Notify {
    static func setup(delegate: UNUserNotificationCenterDelegate) {
        let c = UNUserNotificationCenter.current()
        c.delegate = delegate
        c.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    static func send(_ title: String, _ body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }
}

// MARK: - 입력창 (Spotlight형)

final class InputPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

final class QuickInput: NSObject, NSTextFieldDelegate, NSWindowDelegate {
    static let width: CGFloat = 640, barHeight: CGFloat = 56, rowHeight: CGFloat = 34, hintHeight: CGFloat = 26

    let panel: InputPanel
    let field = NSTextField()
    let icon = NSImageView()
    let rowsBox = NSView()
    var onSubmit: (String) -> Void = { _ in }
    // 기존 할 일 고치기
    var todos: () -> [Todo] = { [] }
    var onComplete: (Todo) -> Void = { _ in }
    var onDelete: (Todo) -> Void = { _ in }
    var onRename: (Todo, String) -> Void = { _, _ in }

    private var matches: [Todo] = []
    private var selected = -1
    private var editing: Todo?

    override init() {
        panel = InputPanel(contentRect: NSRect(x: 0, y: 0, width: QuickInput.width, height: QuickInput.barHeight),
                           styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        super.init()
        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isMovableByWindowBackground = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.delegate = self

        // 회색 반투명 재질
        let glass = NSVisualEffectView(frame: panel.contentRect(forFrameRect: panel.frame))
        glass.material = .popover
        glass.blendingMode = .behindWindow
        glass.state = .active
        glass.wantsLayer = true
        glass.layer?.cornerRadius = 14
        glass.layer?.masksToBounds = true
        glass.layer?.borderWidth = 0.5
        glass.layer?.borderColor = NSColor.black.withAlphaComponent(0.12).cgColor
        panel.contentView = glass

        // 입력 줄은 창이 아래로 늘어나도 맨 위에 붙어 있다
        icon.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 20, weight: .regular)
        icon.contentTintColor = .controlAccentColor
        icon.frame = NSRect(x: 16, y: 16, width: 24, height: 24)
        icon.autoresizingMask = [.minYMargin]
        glass.addSubview(icon)

        field.frame = NSRect(x: 50, y: 13, width: 574, height: 30)
        field.autoresizingMask = [.minYMargin]
        field.isBordered = false
        field.isBezeled = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.font = .systemFont(ofSize: 22, weight: .regular)
        field.cell?.isScrollable = true
        field.cell?.wraps = false
        field.delegate = self
        glass.addSubview(field)

        rowsBox.frame = NSRect(x: 0, y: 0, width: QuickInput.width, height: 0)
        glass.addSubview(rowsBox)
        render()
    }

    var isVisible: Bool { panel.isVisible }

    func show() {
        // 마우스가 있는 화면, 위쪽 1/3 지점 가운데
        reset()
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main!
        let f = screen.visibleFrame
        panel.setFrameOrigin(NSPoint(x: f.midX - panel.frame.width / 2, y: f.maxY - f.height / 3))
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(field)
    }

    func hide() {
        guard panel.isVisible else { return }
        panel.orderOut(nil)
        // 원래 쓰던 앱으로 포커스 돌려주기 (할 일 창이 떠 있으면 그 창까지 숨기면 안 된다)
        if !AppDelegate.shared.main.isVisible { NSApp.hide(nil) }
    }

    private func reset() {
        field.stringValue = ""
        matches = []
        selected = -1
        editing = nil
        render()
    }

    /// 목록이 갱신되면 열려 있는 결과도 다시 맞춘다
    func todosChanged() {
        if panel.isVisible && editing == nil { search() }
    }

    // MARK: 기존 할 일 찾기

    private func search() {
        let squash = { (text: String) in text.lowercased().filter { !$0.isWhitespace } }
        let q = squash(field.stringValue)
        let keep = selected >= 0 && selected < matches.count ? matches[selected].id : nil
        matches = q.isEmpty ? [] : Array(todos().filter { !$0.done && squash($0.title).contains(q) }.prefix(5))
        selected = keep.flatMap { id in matches.firstIndex { $0.id == id } } ?? -1
        render()
    }

    func controlTextDidChange(_ obj: Notification) {
        if editing == nil { search() }
    }

    private func dueLabel(_ t: Todo) -> String {
        guard let due = t.due else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        let today = Calendar.current.isDateInToday(due)
        if t.all_day ?? false { f.dateFormat = today ? "'오늘'" : "M/d (E)" }
        else { f.dateFormat = today ? "a h:mm" : "M/d a h:mm" }
        return f.string(from: due)
    }

    /// 입력 줄 아래에 결과 줄과 도움말을 그리고, 위쪽 가장자리를 고정한 채 창 높이를 맞춘다
    private func render() {
        let symbol = editing != nil ? "pencil.circle.fill" : "plus.circle.fill"
        icon.image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
        field.placeholderString = editing != nil ? "새 제목" : "할 일 추가 · 제목을 치면 수정·삭제"

        rowsBox.subviews.forEach { $0.removeFromSuperview() }
        let n = matches.count
        let extra = n == 0 ? 0 : CGFloat(n) * QuickInput.rowHeight + QuickInput.hintHeight + 8
        let top = panel.frame.maxY
        let height = QuickInput.barHeight + extra
        panel.setFrame(NSRect(x: panel.frame.minX, y: top - height, width: QuickInput.width, height: height), display: true)
        rowsBox.frame = NSRect(x: 0, y: 0, width: QuickInput.width, height: extra)
        guard n > 0 else { return }

        let line = NSBox(frame: NSRect(x: 0, y: extra - 1, width: QuickInput.width, height: 1))
        line.boxType = .separator
        rowsBox.addSubview(line)

        for (i, t) in matches.enumerated() {
            let on = i == selected
            let row = NSView(frame: NSRect(x: 8, y: extra - 5 - CGFloat(i + 1) * QuickInput.rowHeight,
                                           width: QuickInput.width - 16, height: QuickInput.rowHeight - 2))
            row.wantsLayer = true
            row.layer?.cornerRadius = 7
            row.layer?.backgroundColor = on ? NSColor.controlAccentColor.cgColor : NSColor.clear.cgColor

            let mark = NSImageView(image: NSImage(systemSymbolName: editing != nil ? "pencil" : "circle", accessibilityDescription: nil)!)
            mark.contentTintColor = on ? .white : .secondaryLabelColor
            mark.frame = NSRect(x: 10, y: 8, width: 16, height: 16)
            row.addSubview(mark)

            let title = NSTextField(labelWithString: t.title)
            title.font = .systemFont(ofSize: 14)
            title.textColor = on ? .white : .labelColor
            title.lineBreakMode = .byTruncatingTail
            title.frame = NSRect(x: 36, y: 7, width: 430, height: 18)
            row.addSubview(title)

            let when = NSTextField(labelWithString: dueLabel(t))
            when.font = .systemFont(ofSize: 12)
            when.textColor = on ? NSColor.white.withAlphaComponent(0.8) : .secondaryLabelColor
            when.alignment = .right
            when.frame = NSRect(x: 470, y: 8, width: 144, height: 16)
            row.addSubview(when)
            rowsBox.addSubview(row)
        }

        let text = editing != nil ? "↩ 제목 저장   esc 취소"
            : selected >= 0 ? "↩ 완료   ⌘⌫ 삭제   ⇥ 제목 수정   esc 닫기"
            : "↓ 기존 할 일 고르기   ↩ 비서에게 보내기"
        let hint = NSTextField(labelWithString: text)
        hint.font = .systemFont(ofSize: 11)
        hint.textColor = .tertiaryLabelColor
        hint.frame = NSRect(x: 18, y: 7, width: QuickInput.width - 36, height: 15)
        rowsBox.addSubview(hint)
    }

    // MARK: 키

    func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
        if textView.hasMarkedText() { return false } // 한글 조합 중이면 조합부터 끝낸다
        let picked = selected >= 0 && selected < matches.count ? matches[selected] : nil

        switch selector {
        case #selector(NSResponder.insertNewline(_:)):
            let text = textView.string.trimmingCharacters(in: .whitespacesAndNewlines)
            let renaming = editing
            hide()
            if let todo = renaming {
                if !text.isEmpty && text != todo.title { onRename(todo, text) }
            } else if let todo = picked {
                onComplete(todo)
            } else if !text.isEmpty {
                onSubmit(text)
            }
            return true
        case #selector(NSResponder.cancelOperation(_:)):
            if editing != nil { reset() } else { hide() }
            return true
        case #selector(NSResponder.moveDown(_:)) where editing == nil && !matches.isEmpty:
            selected = min(selected + 1, matches.count - 1)
            render()
            return true
        case #selector(NSResponder.moveUp(_:)) where editing == nil && !matches.isEmpty:
            selected = max(selected - 1, -1)
            render()
            return true
        case #selector(NSResponder.insertTab(_:)):
            // 결과가 하나뿐이면 고르지 않아도 그 할 일을 수정한다
            guard editing == nil, let todo = picked ?? (matches.count == 1 ? matches[0] : nil) else { return true }
            editing = todo
            matches = [todo]
            selected = 0
            field.stringValue = todo.title
            textView.string = todo.title
            textView.selectAll(nil)
            render()
            return true
        case #selector(NSResponder.deleteToBeginningOfLine(_:)): // ⌘⌫
            guard editing == nil, let todo = picked else { return false }
            hide()
            onDelete(todo)
            return true
        default:
            return false
        }
    }

    // 다른 곳을 누르면 닫기
    func windowDidResignKey(_ notification: Notification) { hide() }
}

// MARK: - 할 일 창

/// 창 맨 위의 투명한 띠: 잡고 끌면 창이 움직이고, 두 번 누르면 확대/축소 (보통의 제목 막대처럼)
final class DragStrip: NSView {
    static let height: CGFloat = 24
    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 { window?.performZoom(nil) } else { window?.performDrag(with: event) }
    }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

final class MainWindow: NSObject, NSWindowDelegate, WKNavigationDelegate {
    private var window: NSWindow?
    private var web: WKWebView?

    var isVisible: Bool { window?.isVisible ?? false }

    func show() {
        if window == nil { build() }
        NSApp.setActivationPolicy(.regular) // 창이 떠 있는 동안은 Dock·⌘Tab에 보이게
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
        todosChanged()
    }

    private func build() {
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 840),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                         backing: .buffered, defer: false)
        w.title = "할 일"
        w.titleVisibility = .hidden
        w.titlebarAppearsTransparent = true
        w.isReleasedWhenClosed = false
        w.minSize = NSSize(width: 420, height: 520)
        w.center()
        w.setFrameAutosaveName("main")
        w.delegate = self

        let config = WKWebViewConfiguration()
        // 저장소를 남기지 않는다: 앱을 다시 설치했을 때 캐시된 옛 화면이 뜨지 않게
        config.websiteDataStore = .nonPersistent()
        // 웹 화면이 '앱 안'임을 알고 신호등 버튼 자리를 비우게 한다
        config.userContentController.addUserScript(WKUserScript(
            source: "document.documentElement.classList.add('mac-app')", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let v = WKWebView(frame: .zero, configuration: config)
        v.navigationDelegate = self
        v.allowsBackForwardNavigationGestures = false
        // 웹 화면이 창 전체를 덮어서 제목 막대를 잡을 수 없다 → 맨 위에 투명한 손잡이를 얹는다
        let box = NSView(frame: w.contentLayoutRect)
        v.frame = box.bounds
        v.autoresizingMask = [.width, .height]
        box.addSubview(v)
        let grip = DragStrip(frame: NSRect(x: 0, y: box.bounds.height - DragStrip.height, width: box.bounds.width, height: DragStrip.height))
        grip.autoresizingMask = [.width, .minYMargin]
        box.addSubview(grip)
        w.contentView = box
        v.load(URLRequest(url: webURL, cachePolicy: .reloadIgnoringLocalCacheData))
        window = w
        web = v
    }

    /// 빠른 추가·메뉴에서 바꾼 내용을 열려 있는 창에 반영
    func todosChanged() {
        web?.evaluateJavaScript("window.dispatchEvent(new Event('todos-changed'))", completionHandler: nil)
    }

    func windowWillClose(_ notification: Notification) {
        if ProcessInfo.processInfo.environment["QUICKTODO_DOCK"] == nil { NSApp.setActivationPolicy(.accessory) }
    }

    // 로그인 직후처럼 서버가 아직 안 떴으면 잠시 뒤 다시 시도
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { webView.load(URLRequest(url: webURL, cachePolicy: .reloadIgnoringLocalCacheData)) }
    }

    // 바깥 링크는 기본 브라우저로
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, url.host != webURL.host, url.scheme?.hasPrefix("http") == true {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }
}

// MARK: - 앱

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, UNUserNotificationCenterDelegate {
    static var shared: AppDelegate!
    let input = QuickInput()
    let main = MainWindow()
    var status: NSStatusItem!
    var todos: [Todo] = []
    var serverDown = false
    var pending = 0 { didSet { updateIcon() } }
    var hotKey: EventHotKeyRef?
    var signalSource: DispatchSourceSignal?

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        buildMainMenu()
        Notify.setup(delegate: self)

        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        let menu = NSMenu()
        menu.delegate = self
        status.menu = menu
        updateIcon()

        input.onSubmit = { [weak self] text in self?.send(text) }
        input.todos = { [weak self] in self?.todos ?? [] }
        input.onComplete = { [weak self] todo in self?.patch(todo, ["done": true], done: "완료") }
        input.onRename = { [weak self] todo, title in self?.patch(todo, ["title": title], done: "수정", body: "\(todo.title) → \(title)") }
        input.onDelete = { [weak self] todo in
            Server.request("todos/\(todo.id)", method: "DELETE") { result in
                if case .failure(let err) = result { Notify.send("삭제 실패", err.localizedDescription) }
                else { Notify.send("삭제", todo.title) }
                self?.refresh()
            }
        }
        registerHotKey()
        refresh()
        Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.refresh() }
    }

    // ⌘⇧D (Carbon 핫키: 손쉬운 사용 권한 필요 없음)
    func registerHotKey() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetEventDispatcherTarget(), { _, _, _ in
            NSLog("단축키 눌림")
            DispatchQueue.main.async { AppDelegate.shared.toggleInput() }
            return noErr
        }, 1, &spec, nil, nil)
        let id = EventHotKeyID(signature: OSType(0x5154_4F44), id: 1) // 'QTOD'
        let err = RegisterEventHotKey(UInt32(kVK_ANSI_D), UInt32(cmdKey | shiftKey), id, GetEventDispatcherTarget(), 0, &hotKey)
        NSLog(err == noErr ? "단축키 ⌘⇧D 등록됨" : "단축키 등록 실패 (\(err)): 다른 앱이 ⌘⇧D를 쓰고 있을 수 있음")
        if err != noErr { Notify.send("단축키를 쓸 수 없어", "다른 앱이 ⌘⇧D를 쓰고 있어. 메뉴 막대 아이콘의 '빠른 추가…'는 그대로 돼.") }

        // `kill -USR1 <pid>` 로도 입력창을 열 수 있다 (다른 자동화 도구에서 부를 때)
        signal(SIGUSR1, SIG_IGN)
        let src = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
        src.setEventHandler { AppDelegate.shared.toggleInput() }
        src.resume()
        signalSource = src
    }

    @objc func toggleInput() {
        if input.isVisible { return input.hide() }
        input.show()
        refresh() // 방금 다른 곳에서 바뀐 할 일도 찾을 수 있게
    }

    func patch(_ todo: Todo, _ body: [String: Any], done: String, body text: String? = nil) {
        Server.request("todos/\(todo.id)", method: "PATCH", body: body) { [weak self] result in
            if case .failure(let err) = result { Notify.send("\(done) 실패", err.localizedDescription) }
            else { Notify.send(done, text ?? todo.title) }
            self?.refresh()
        }
    }

    // MARK: 마감 알림

    /// 1분마다 목록을 새로 받을 때 같이 본다. 한 번 알린 것은 다시 알리지 않는다 (앱을 다시 켜도)
    func checkReminders() {
        let store = UserDefaults.standard
        var sent = store.stringArray(forKey: "reminded") ?? []
        let now = Date()
        let cal = Calendar.current
        let open = todos.filter { !$0.done }
        let timeFmt = DateFormatter()
        timeFmt.locale = Locale(identifier: "ko_KR")
        timeFmt.dateFormat = "a h:mm"

        // 시간이 있는 할 일: 마감 10분 전
        for t in open where !(t.all_day ?? false) {
            guard let due = t.due else { continue }
            let left = due.timeIntervalSince(now)
            let key = "\(t.id)@\(Int(due.timeIntervalSince1970))"
            guard left > -60, left <= 600, !sent.contains(key) else { continue }
            sent.append(key)
            let mins = Int((left / 60).rounded(.up))
            Notify.send(mins <= 1 ? "지금: \(t.title)" : "\(mins)분 뒤: \(t.title)", "마감 \(timeFmt.string(from: due))")
        }

        // 아침 요약: 오전 중 처음 확인할 때 한 번
        let hour = cal.component(.hour, from: now)
        let dayFmt = DateFormatter()
        dayFmt.dateFormat = "yyyy-MM-dd"
        let dayKey = "morning@\(dayFmt.string(from: now))"
        if (8..<12).contains(hour), !sent.contains(dayKey) {
            sent.append(dayKey)
            let today = open.filter { $0.due.map(cal.isDateInToday) ?? false }
            let overdue = open.filter { ($0.due ?? .distantFuture) < cal.startOfDay(for: now) }
            if !today.isEmpty || !overdue.isEmpty {
                var lines = today.prefix(4).map { "· \($0.title)" }
                if today.count > 4 { lines.append("· 그 밖에 \(today.count - 4)개") }
                if !overdue.isEmpty { lines.append("밀린 일 \(overdue.count)개") }
                Notify.send("오늘 할 일 \(today.count)개", lines.joined(separator: "\n"))
            }
        }
        store.set(Array(sent.suffix(300)), forKey: "reminded")
    }

    func updateIcon() {
        let name = pending > 0 ? "ellipsis.circle" : "checklist"
        status.button?.image = NSImage(systemSymbolName: name, accessibilityDescription: "할 일")
        status.button?.image?.isTemplate = true
        status.button?.toolTip = pending > 0 ? "비서가 처리 중…" : "할 일 (⌘⇧D)"
    }

    // MARK: 비서에게 보내기

    func send(_ text: String) {
        pending += 1
        Server.request("chat", method: "POST", body: ["message": text], timeout: 180) { [weak self] result in
            guard let self else { return }
            self.pending -= 1
            switch result {
            case .success(let data):
                let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
                let reply = obj["reply"] as? String ?? ""
                let actions = obj["actions"] as? [String] ?? []
                Notify.send(actions.isEmpty ? "비서" : actions.joined(separator: ", "), reply)
                self.refresh()
            case .failure(let err):
                Notify.send("처리하지 못했어", "\(err.localizedDescription)\n입력: \(text)")
            }
        }
    }

    // MARK: 메뉴 막대

    func refresh() {
        Server.request("todos") { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let data):
                self.todos = (try? JSONDecoder().decode([Todo].self, from: data)) ?? []
                self.serverDown = false
                self.checkReminders()
                self.input.todosChanged()
            case .failure:
                self.serverDown = true
            }
            if let menu = self.status.menu { self.build(menu) }
            self.main.todosChanged()
        }
    }

    func menuWillOpen(_ menu: NSMenu) {
        build(menu)
        refresh()
    }

    func build(_ menu: NSMenu) {
        menu.removeAllItems()
        let cal = Calendar.current
        let startOfToday = cal.startOfDay(for: Date())
        let open = todos.filter { !$0.done }.sorted { ($0.due ?? .distantFuture) < ($1.due ?? .distantFuture) }
        let overdue = open.filter { ($0.due ?? .distantFuture) < startOfToday }
        let today = open.filter { $0.due.map(cal.isDateInToday) ?? false }

        let timeFmt = DateFormatter()
        timeFmt.locale = Locale(identifier: "ko_KR")
        timeFmt.dateFormat = "a h:mm"
        let dayFmt = DateFormatter()
        dayFmt.locale = Locale(identifier: "ko_KR")
        dayFmt.dateFormat = "M/d"

        func header(_ title: String, color: NSColor = .secondaryLabelColor) {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            item.attributedTitle = NSAttributedString(string: title, attributes: [
                .font: NSFont.systemFont(ofSize: 11, weight: .semibold), .foregroundColor: color,
            ])
            item.isEnabled = false
            menu.addItem(item)
        }
        func row(_ t: Todo, _ when: String) {
            let item = NSMenuItem(title: "\(t.title)    \(when)", action: #selector(complete(_:)), keyEquivalent: "")
            item.target = self
            item.tag = t.id
            item.image = NSImage(systemSymbolName: "circle", accessibilityDescription: nil)
            item.toolTip = "누르면 완료"
            menu.addItem(item)
        }

        if serverDown {
            header("서버에 연결할 수 없어", color: .systemRed)
        } else {
            if !overdue.isEmpty {
                header("밀린 일 \(overdue.count)", color: .systemRed)
                overdue.forEach { row($0, dayFmt.string(from: $0.due!)) }
                menu.addItem(.separator())
            }
            header("오늘 \(today.count)")
            if today.isEmpty {
                header("  오늘 마감인 일 없음")
            } else {
                today.forEach { row($0, timeFmt.string(from: $0.due!)) }
            }
        }

        menu.addItem(.separator())
        let add = NSMenuItem(title: "빠른 추가…", action: #selector(toggleInput), keyEquivalent: "d")
        add.keyEquivalentModifierMask = [.command, .shift]
        add.target = self
        menu.addItem(add)
        let web = NSMenuItem(title: "할 일 열기", action: #selector(openMain), keyEquivalent: "")
        web.target = self
        menu.addItem(web)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
    }

    @objc func complete(_ sender: NSMenuItem) {
        let title = todos.first { $0.id == sender.tag }?.title ?? ""
        Server.request("todos/\(sender.tag)", method: "PATCH", body: ["done": true]) { [weak self] result in
            if case .failure(let err) = result { Notify.send("완료 처리 실패", err.localizedDescription) }
            else { Notify.send("완료", title) }
            self?.refresh()
        }
    }

    @objc func openMain() { main.show() }

    // Dock·Launchpad·Spotlight에서 앱을 열면 할 일 창을 띄운다
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        main.show()
        return false
    }

    // ⌘C/⌘V 같은 편집 단축키는 메인 메뉴가 있어야 동작한다
    func buildMainMenu() {
        let bar = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "빠른 추가…", action: #selector(toggleInput), keyEquivalent: "")
        appMenu.addItem(.separator())
        // ⌘Q는 창만 닫는다. 단축키와 메뉴 막대는 계속 살아 있어야 해서, 완전 종료는 메뉴 막대 아이콘에서
        appMenu.addItem(withTitle: "창 닫기", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        bar.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "편집")
        edit.addItem(withTitle: "실행 취소", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "실행 복귀", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "오려두기", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "복사하기", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "붙여넣기", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "전체 선택", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        bar.addItem(editItem)

        let winItem = NSMenuItem()
        let win = NSMenu(title: "윈도우")
        win.addItem(withTitle: "닫기", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        win.addItem(withTitle: "최소화", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        winItem.submenu = win
        bar.addItem(winItem)
        NSApp.mainMenu = bar
    }

    // 앱이 앞에 있어도 알림 배너를 보여준다
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler handler: @escaping (UNNotificationPresentationOptions) -> Void) {
        handler([.banner, .sound])
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
// 평소에는 Dock 아이콘 없이 메뉴 막대에만. QUICKTODO_DOCK=1 이면 Dock에 보이게 (화면 자동화 테스트용)
app.setActivationPolicy(ProcessInfo.processInfo.environment["QUICKTODO_DOCK"] == nil ? .accessory : .regular)
app.run()
