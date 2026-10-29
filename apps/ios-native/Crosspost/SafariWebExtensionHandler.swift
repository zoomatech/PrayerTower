import SafariServices
import os.log

// The native side of the cross-posting Safari extension (apps/extension), as Apple's
// safari-web-extension-packager generates it. The extension talks to the server itself and sends
// no native messages; anything that does arrive is answered with an echo.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey]
        os_log(.default, "Cross-posting extension message: %@", String(describing: message))
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["echo": message]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
