// Menu bar commands and keyboard shortcuts for the app on a Mac ("Designed for
// iPad") and on iPad with a keyboard. JavaScript sends the commands with their
// titles in the member's language; choosing one sends `onCommand` back.
// Uses UIMainMenuSystem (iOS/iPadOS/macOS 26 and later):
// https://developer.apple.com/documentation/uikit/uimainmenusystem
import ExpoModulesCore
import UIKit

struct MenuCommand: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  /** "file", "go" (a new menu after View) or "help". */
  @Field var menu: String = "go"
  /** Key equivalent, used with Command. Empty for none. */
  @Field var key: String = ""
  @Field var shift: Bool = false
}

public class MacMenuModule: Module {
  // Touched only on the main thread.
  nonisolated(unsafe) static weak var current: MacMenuModule?
  nonisolated(unsafe) static var commands: [MenuCommand] = []
  nonisolated(unsafe) static var goTitle = "Go"
  nonisolated(unsafe) static var configured = false

  public func definition() -> ModuleDefinition {
    Name("MacMenu")

    Events("onCommand")

    OnCreate {
      MacMenuModule.current = self
      Task { @MainActor in MacMenuModule.restrictWindowSize() }
    }

    Function("setCommands") { (goTitle: String, commands: [MenuCommand]) in
      Task { @MainActor in
        MacMenuModule.goTitle = goTitle
        MacMenuModule.commands = commands
        MacMenuModule.rebuild()
      }
    }
  }

  func send(_ id: String) {
    sendEvent("onCommand", ["id": id])
  }

  @MainActor static func rebuild() {
    guard #available(iOS 26.0, *) else { return }
    if configured {
      UIMainMenuSystem.shared.setNeedsRebuild()
      return
    }
    configured = true
    UIMainMenuSystem.shared.setBuildConfiguration(UIMainMenuSystem.Configuration()) { builder in
      MacMenuModule.build(builder)
    }
  }

  @MainActor static func build(_ builder: UIMenuBuilder) {
    func items(_ menu: String) -> [UIMenuElement] {
      commands.filter { $0.menu == menu }.map { c in
        UIKeyCommand(
          title: c.title,
          action: #selector(UIApplication.prayerTowerMenuCommand(_:)),
          input: c.key,
          modifierFlags: c.shift ? [.command, .shift] : .command,
          propertyList: c.id
        )
      }
    }
    let file = items("file")
    if !file.isEmpty {
      builder.insertChild(UIMenu(title: "", options: .displayInline, children: file), atStartOfMenu: .file)
    }
    let go = items("go")
    if !go.isEmpty {
      builder.insertSibling(UIMenu(title: goTitle, identifier: UIMenu.Identifier("com.zoomatech.prayertower.go"), children: go), afterMenu: .view)
    }
    let help = items("help")
    if !help.isEmpty {
      builder.insertChild(UIMenu(title: "", options: .displayInline, children: help), atStartOfMenu: .help)
    }
  }

  /// Keeps windows on a Mac or iPad at least as big as a small phone, so the layout never squeezes.
  @MainActor static func restrictWindowSize() {
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      scene.sizeRestrictions?.minimumSize = CGSize(width: 375, height: 600)
    }
  }
}

extension UIApplication {
  /// The menu bar sends every command here (UIApplication is in each window's responder chain).
  @objc func prayerTowerMenuCommand(_ sender: UICommand) {
    if let id = sender.propertyList as? String {
      MacMenuModule.current?.send(id)
    }
  }
}
