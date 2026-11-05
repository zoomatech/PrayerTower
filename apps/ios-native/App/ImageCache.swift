import PrayerTowerKit
import SwiftUI
#if canImport(UIKit)
import UIKit
import ImageIO

/// Photos on posts, kept in memory and on disk by their storage path. The signed URL changes
/// every time a post loads, so the system's URL cache never hits; this does, so going back to a
/// post or scrolling past a photo again doesn't download it again.
///
/// Reading, downloading and decoding run off the actor, several at once, and each photo is
/// decoded at screen size (ImageIO thumbnail), not at the camera's full size, so scrolling past
/// photos stays smooth and memory stays low. The disk copy is capped at 200 MB (Steve, 2026-11-05),
/// dropping the photos seen longest ago first.
actor ImageCache {
    static let shared = ImageCache()
    /// Longest side of a decoded photo, in pixels: wider than any iPhone screen.
    static let maxPixels = 1600
    static let diskLimit = 200 * 1024 * 1024
    /// After a trim the folder is left a little under the cap, so it isn't trimmed on every write.
    static let diskTarget = 180 * 1024 * 1024

    private let memory = NSCache<NSString, UIImage>()
    private let folder: URL
    private var loading: [String: Task<UIImage?, Never>] = [:]
    private var writesSinceTrim = 0

    init() {
        memory.totalCostLimit = 64 * 1024 * 1024
        folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("post-photos", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let folder = self.folder
        Task.detached(priority: .background) { Self.trim(folder) }
    }

    func image(path: String, url: URL) async -> UIImage? {
        if let hit = memory.object(forKey: path as NSString) { return hit }
        // One download for a photo however many rows ask for it at once.
        if let running = loading[path] { return await running.value }
        let file = folder.appendingPathComponent(PhotoCacheKey.fileName(path))
        let task = Task.detached(priority: .userInitiated) { () -> UIImage? in
            if let data = try? Data(contentsOf: file), let image = Self.decode(data) {
                // Seen again: it moves to the back of the line for trimming.
                try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
                return image
            }
            guard let (data, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode ?? 200 < 300,
                  let image = Self.decode(data) else { return nil }
            try? data.write(to: file, options: .completeFileProtectionUntilFirstUserAuthentication)
            return image
        }
        loading[path] = task
        let image = await task.value
        loading[path] = nil
        if let image {
            memory.setObject(image, forKey: path as NSString, cost: Int(image.size.width * image.size.height * image.scale * image.scale * 4))
            writesSinceTrim += 1
            if writesSinceTrim >= 25 {
                writesSinceTrim = 0
                let folder = self.folder
                Task.detached(priority: .background) { Self.trim(folder) }
            }
        }
        return image
    }

    /// The photo at screen size, upright, decoded now rather than on first draw.
    nonisolated static func decode(_ data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }

    /// Keeps the folder under the cap, dropping the photos seen longest ago first.
    nonisolated static func trim(_ folder: URL) {
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey]
        guard let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: keys) else { return }
        var entries = files.compactMap { url -> (url: URL, size: Int, date: Date)? in
            guard let v = try? url.resourceValues(forKeys: Set(keys)) else { return nil }
            return (url, v.fileSize ?? 0, v.contentModificationDate ?? .distantPast)
        }
        var total = entries.reduce(0) { $0 + $1.size }
        guard total > diskLimit else { return }
        entries.sort { $0.date < $1.date }
        for e in entries where total > diskTarget {
            try? FileManager.default.removeItem(at: e.url)
            total -= e.size
        }
    }
}

/// A post's photo from the cache, with a placeholder while it loads.
struct CachedPhoto: View {
    let path: String
    let url: URL
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                Color.secondary.opacity(0.1).frame(height: 200)
            }
        }
        .task(id: path) { image = await ImageCache.shared.image(path: path, url: url) }
    }
}
#else
/// On the Mac, the system's image loading; the cache above is for the iPhone and iPad app.
struct CachedPhoto: View {
    let path: String
    let url: URL

    var body: some View {
        AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { Color.secondary.opacity(0.1).frame(height: 200) }
    }
}
#endif
