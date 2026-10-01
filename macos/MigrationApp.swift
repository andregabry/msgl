import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var statusLabel: NSTextField?
    private var serverProcess: Process?
    private var stdoutBuffer = ""
    private var stderrBuffer = ""
    private var isTerminating = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        createWindow()
        startLocalServer()
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        isTerminating = true
        serverProcess?.standardOutput.map { ($0 as? Pipe)?.fileHandleForReading.readabilityHandler = nil }
        serverProcess?.standardError.map { ($0 as? Pipe)?.fileHandleForReading.readabilityHandler = nil }
        if serverProcess?.isRunning == true {
            serverProcess?.terminate()
        }
    }

    private func createWindow() {
        let initialFrame = NSRect(x: 0, y: 0, width: 1440, height: 900)
        let window = NSWindow(
            contentRect: initialFrame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Migração Google Groups → M365"
        window.minSize = NSSize(width: 980, height: 680)
        window.center()

        let loadingView = NSView(frame: initialFrame)
        loadingView.wantsLayer = true
        loadingView.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        let label = NSTextField(labelWithString: "A iniciar o painel local seguro…")
        label.font = .systemFont(ofSize: 17, weight: .medium)
        label.textColor = .secondaryLabelColor
        label.alignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        loadingView.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: loadingView.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: loadingView.centerYAnchor),
        ])

        window.contentView = loadingView
        window.makeKeyAndOrderFront(nil)
        self.window = window
        self.statusLabel = label
    }

    private func startLocalServer() {
        guard let resourceRoot = Bundle.main.resourceURL?.appendingPathComponent("MigrationSystem") else {
            showFatalError("Os recursos do sistema de migração não foram encontrados no aplicativo.")
            return
        }
        let serverScript = resourceRoot.appendingPathComponent("interface/server.py")
        guard FileManager.default.fileExists(atPath: serverScript.path) else {
            showFatalError("O servidor local não foi incluído corretamente no aplicativo.")
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        process.arguments = [serverScript.path]
        process.currentDirectoryURL = resourceRoot

        var environment = ProcessInfo.processInfo.environment
        let requiredPaths = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
        let existingPaths = (environment["PATH"] ?? "").split(separator: ":").map(String.init)
        environment["PATH"] = Array(Set(requiredPaths + existingPaths)).joined(separator: ":")
        environment["PYTHONUNBUFFERED"] = "1"
        process.environment = environment

        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        outputPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async { self?.consumeStandardOutput(text) }
        }
        errorPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                guard let self else { return }
                self.stderrBuffer = String((self.stderrBuffer + text).suffix(8_000))
            }
        }
        process.terminationHandler = { [weak self] finishedProcess in
            DispatchQueue.main.async {
                guard let self, !self.isTerminating else { return }
                self.showFatalError(
                    "O servidor local terminou inesperadamente (código \(finishedProcess.terminationStatus)).\n\n\(self.stderrBuffer)"
                )
            }
        }

        do {
            try process.run()
            serverProcess = process
        } catch {
            showFatalError("Não foi possível iniciar o servidor local: \(error.localizedDescription)")
        }
    }

    private func consumeStandardOutput(_ text: String) {
        stdoutBuffer += text
        while let newline = stdoutBuffer.firstIndex(of: "\n") {
            let line = String(stdoutBuffer[..<newline]).trimmingCharacters(in: .whitespacesAndNewlines)
            stdoutBuffer.removeSubrange(...newline)
            if line.hasPrefix("Endereço: ") {
                let address = String(line.dropFirst("Endereço: ".count))
                if let url = URL(string: address) {
                    loadPanel(url)
                }
            }
        }
    }

    private func loadPanel(_ url: URL) {
        guard webView == nil, let window else { return }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: window.contentView?.bounds ?? .zero, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        window.contentView = webView
        self.webView = webView
        self.statusLabel = nil
        webView.load(URLRequest(url: url))
    }

    private func showFatalError(_ message: String) {
        statusLabel?.stringValue = "Não foi possível abrir o painel."
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Migração Google Groups → M365"
        alert.informativeText = message
        alert.addButton(withTitle: "Fechar")
        alert.runModal()
        NSApp.terminate(nil)
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.setActivationPolicy(.regular)
application.delegate = delegate
application.run()
