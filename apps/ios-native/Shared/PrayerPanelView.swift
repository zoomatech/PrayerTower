import ImageIO
import PhotosUI
import PrayerTowerKit
import SwiftUI
import UniformTypeIdentifiers

// The prayer panel on the iPhone and the Mac (the Expo app's prayer-panel screen, natively): the
// latest prayers that went out drawn as one picture to show or print, and reading a panel with the
// camera (iPhone), from a photo, or from a picture file (Mac). Drawing and reading run on the device
// (PrayerPanel in PrayerTowerKit). Off until Admin → Radio turns it on. With no server or account
// (`api` nil) it draws PanelDemo, the sample prayers.

/// A panel drawn on screen: black cells on white, as a camera or an SSTV receiver sees it.
struct PanelPicture: View {
    let cells: [UInt8]
    let label: String
    var cell: CGFloat = 4

    var body: some View {
        Canvas { ctx, _ in
            ctx.fill(Path(CGRect(x: 0, y: 0, width: CGFloat(PrayerPanel.width) * cell, height: CGFloat(PrayerPanel.height) * cell)), with: .color(.white))
            var p = Path()
            for (i, c) in cells.enumerated() where c != 0 {
                p.addRect(CGRect(x: CGFloat(i % PrayerPanel.width) * cell, y: CGFloat(i / PrayerPanel.width) * cell, width: cell, height: cell))
            }
            ctx.fill(p, with: .color(.black))
        }
        .frame(width: CGFloat(PrayerPanel.width) * cell, height: CGFloat(PrayerPanel.height) * cell)
        .accessibilityElement()
        .accessibilityAddTraits(.isImage)
        .accessibilityLabel(label)
    }
}

/// A picture (any size) as grayscale about 1,000 pixels wide, read for a panel.
enum PanelPhoto {
    static func read(_ image: CGImage) -> PanelRead? {
        let scale = min(1, 1000 / Double(max(image.width, 1)))
        let w = max(1, Int(Double(image.width) * scale)), h = max(1, Int(Double(image.height) * scale))
        var gray = [UInt8](repeating: 255, count: w * h)
        let drawn = gray.withUnsafeMutableBytes { buf -> Bool in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return drawn ? PrayerPanel.read(gray: gray, width: w, height: h) : nil
    }

    static func read(_ data: Data) -> PanelRead? {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil), let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
        return read(image)
    }

    /// The panel as a picture to print, `scale` pixels a cell.
    static func image(_ cells: [UInt8], scale: Int = 8) -> CGImage? {
        let w = PrayerPanel.width * scale, h = PrayerPanel.height * scale
        var px = [UInt8](repeating: 255, count: w * h)
        for y in 0..<h { for x in 0..<w where cells[(y / scale) * PrayerPanel.width + x / scale] != 0 { px[y * w + x] = 0 } }
        guard let provider = CGDataProvider(data: Data(px) as CFData) else { return nil }
        return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    }

    static func print(_ cells: [UInt8]) {
        guard let image = image(cells) else { return }
        #if os(iOS)
        let controller = UIPrintInteractionController.shared
        controller.printingItem = UIImage(cgImage: image)
        controller.present(animated: true)
        #else
        let view = NSImageView(frame: NSRect(x: 0, y: 0, width: image.width / 2, height: image.height / 2))
        view.image = NSImage(cgImage: image, size: view.frame.size)
        NSPrintOperation(view: view).run()
        #endif
    }
}

#if os(iOS)
/// The iPhone's camera, for one photo of a panel.
struct PanelCamera: UIViewControllerRepresentable {
    let done: (CGImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let done: (CGImage?) -> Void
        init(done: @escaping (CGImage?) -> Void) { self.done = done }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            done((info[.originalImage] as? UIImage)?.cgImage)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { done(nil) }
    }
}
#endif

/// "Read a panel with the camera" (iPhone), "from a picture", with what was read.
struct PanelReaderSection: View {
    let words: Words
    @State private var photo: PhotosPickerItem?
    @State private var note: String?
    @State private var read: PanelRead?
    @State private var camera = false
    @State private var importing = false

    var body: some View {
        let w = words
        Section(w("panel.readTitle")) {
            #if os(iOS)
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button(w("panel.camera")) { camera = true }
            }
            #endif
            PhotosPicker(w("panel.picture"), selection: $photo, matching: .images)
            #if os(macOS)
            Button(w("panel.picture") + "…") { importing = true }
            #endif
            if let note { Text(note).font(.footnote) }
            if let r = read {
                Text(w("panel.readFrom", ["callSign": r.callSign], count: r.prayers?.count ?? 0)).font(.headline)
                ForEach(Array((r.prayers ?? []).enumerated()), id: \.offset) { Text("• \($0.element)") }
            }
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task {
                note = w("panel.reading")
                let data = try? await item.loadTransferable(type: Data.self)
                show(await Task.detached { data.flatMap { PanelPhoto.read($0) } }.value)
            }
        }
        #if os(iOS)
        .fullScreenCover(isPresented: $camera) {
            PanelCamera { image in
                camera = false
                guard let image else { return }
                note = w("panel.reading")
                Task { show(await Task.detached { PanelPhoto.read(image) }.value) }
            }
            .ignoresSafeArea()
        }
        #endif
        .fileImporter(isPresented: $importing, allowedContentTypes: [.image]) { result in
            guard case let .success(url) = result else { return }
            let access = url.startAccessingSecurityScopedResource()
            let data = try? Data(contentsOf: url)
            if access { url.stopAccessingSecurityScopedResource() }
            note = w("panel.reading")
            Task { show(await Task.detached { data.flatMap { PanelPhoto.read($0) } }.value) }
        }
    }

    private func show(_ r: PanelRead?) {
        if let r {
            read = r
            note = nil
        } else {
            note = words("panel.notFound")
        }
    }
}

/// The prayer panel screen: the latest prayers as a panel (while the switch is on), and the reader.
struct PrayerPanelView: View {
    let api: APIClient?
    let words: Words
    @State private var latest: PanelLatest?

    var body: some View {
        let w = words
        let panel = latest.flatMap { $0.prayers.isEmpty ? nil : PrayerPanel.draw($0.prayers, callSign: $0.callSign) }
        Form {
            if api == nil { Section { Label(w("macConsole.demo"), systemImage: "info.circle") } }
            Section {
                Text(w("panel.intro"))
                if let panel {
                    PanelPicture(cells: panel.cells, label: w("panel.pictureLabel", count: panel.count))
                        .frame(maxWidth: .infinity)
                    Text(w("panel.holds", count: panel.count)).font(.footnote)
                    Button(w("panel.print")) { PanelPhoto.print(panel.cells) }
                }
            }
            PanelReaderSection(words: w)
        }
        .navigationTitle(w("panel.title"))
        .task {
            guard let api else { latest = .sample; return }
            latest = try? await api.radioPanel()
        }
    }
}

/// Admin → Radio: the prayer panel's switch. With no server it changes only the sample.
struct RadioPanelToggle: View {
    let api: APIClient?
    let words: Words
    @State private var on: Bool?

    var body: some View {
        Group {
            if let on {
                Toggle(isOn: Binding(get: { on }, set: { v in Task { await save(v) } })) {
                    Text(words("panel.adminOn"))
                    Text(words("panel.adminHint"))
                }
            }
        }
        .task {
            guard let api else { on = false; return }
            on = (try? await api.radioPanelSwitch())?.enabled
        }
    }

    private func save(_ v: Bool) async {
        guard let api else { on = v; return }
        if let s = try? await api.setRadioPanel(v) { on = s.enabled }
    }
}
