// 할 일 빠른 추가 — 메뉴 막대 앱
// ⌘⇧D: 화면 위쪽에 반투명 입력창 → Enter: 창은 바로 닫히고, 비서(/chat)가 처리하면 맥 알림으로 결과
// 메뉴 막대 아이콘: 밀린 일·오늘 할 일 (누르면 완료), 웹 화면 열기, 종료

import Carbon.HIToolbox
import Cocoa
import UserNotifications

let api = URL(string: ProcessInfo.processInfo.environment["TODO_API"] ?? "http://127.0.0.1:8000")!
let webURL = URL(string: ProcessInfo.processInfo.environment["TODO_WEB"] ?? "http://localhost:8000/")!

// MARK: - 서버

struct Todo: Decodable {
    let id: Int
    let title: String
    let done: Bool
    let due_at: String?

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
    let panel: InputPanel
    let field = NSTextField()
    var onSubmit: (String) -> Void = { _ in }

    override init() {
        panel = InputPanel(contentRect: NSRect(x: 0, y: 0, width: 640, height: 56),
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

        let plus = NSImageView(image: NSImage(systemSymbolName: "plus.circle.fill", accessibilityDescription: nil)!)
        plus.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 20, weight: .regular)
        plus.contentTintColor = .controlAccentColor
        plus.frame = NSRect(x: 16, y: 16, width: 24, height: 24)
        glass.addSubview(plus)

        field.frame = NSRect(x: 50, y: 13, width: 574, height: 30)
        field.isBordered = false
        field.isBezeled = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.font = .systemFont(ofSize: 22, weight: .regular)
        field.placeholderString = "할 일 추가, 완료, 물어보기…"
        field.cell?.isScrollable = true
        field.cell?.wraps = false
        field.delegate = self
        glass.addSubview(field)
    }

    var isVisible: Bool { panel.isVisible }

    func show() {
        // 마우스가 있는 화면, 위쪽 1/3 지점 가운데
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) } ?? NSScreen.main!
        let f = screen.visibleFrame
        panel.setFrameOrigin(NSPoint(x: f.midX - panel.frame.width / 2, y: f.maxY - f.height / 3))
        field.stringValue = ""
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(field)
    }

    func hide() {
        guard panel.isVisible else { return }
        panel.orderOut(nil)
        NSApp.hide(nil) // 원래 쓰던 앱으로 포커스 돌려주기
    }

    // Enter = 보내기, Esc = 닫기
    func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
        if selector == #selector(NSResponder.insertNewline(_:)) {
            if textView.hasMarkedText() { return false } // 한글 조합 중이면 조합만 끝낸다
            let text = textView.string.trimmingCharacters(in: .whitespacesAndNewlines)
            hide()
            if !text.isEmpty { onSubmit(text) }
            return true
        }
        if selector == #selector(NSResponder.cancelOperation(_:)) {
            hide()
            return true
        }
        return false
    }

    // 다른 곳을 누르면 닫기
    func windowDidResignKey(_ notification: Notification) { hide() }
}

// MARK: - 앱

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, UNUserNotificationCenterDelegate {
    static var shared: AppDelegate!
    let input = QuickInput()
    var status: NSStatusItem!
    var todos: [Todo] = []
    var serverDown = false
    var pending = 0 { didSet { updateIcon() } }
    var hotKey: EventHotKeyRef?
    var signalSource: DispatchSourceSignal?

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        Notify.setup(delegate: self)

        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        let menu = NSMenu()
        menu.delegate = self
        status.menu = menu
        updateIcon()

        input.onSubmit = { [weak self] text in self?.send(text) }
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
        input.isVisible ? input.hide() : input.show()
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
            case .failure:
                self.serverDown = true
            }
            if let menu = self.status.menu { self.build(menu) }
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
        let web = NSMenuItem(title: "웹 화면 열기", action: #selector(openWeb), keyEquivalent: "")
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

    @objc func openWeb() { NSWorkspace.shared.open(webURL) }

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
