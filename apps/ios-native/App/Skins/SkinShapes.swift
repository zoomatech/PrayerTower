import PrayerTowerKit
import SwiftUI

extension Color {
    init(_ c: RGB) { self.init(.sRGB, red: c.r, green: c.g, blue: c.b) }
}

/// A whole drawn leaf: pointed base and tip, swelling to the sides (the drawn vine, docs/FEED_SKINS.md).
/// Round leaves swell more; pointed leaves (Golden Wood, Moonlit Gate) are slimmer.
struct LeafOutline: Shape {
    var shape: LeafShape = .round
    func path(in r: CGRect) -> Path {
        let bulge = shape == .pointed ? 0.62 : 0.78
        var p = Path()
        p.move(to: CGPoint(x: r.midX, y: r.minY))
        p.addCurve(to: CGPoint(x: r.midX, y: r.maxY),
                   control1: CGPoint(x: r.maxX + r.width * (bulge - 0.5), y: r.minY + r.height * 0.18),
                   control2: CGPoint(x: r.maxX - r.width * 0.02, y: r.maxY - r.height * 0.22))
        p.addCurve(to: CGPoint(x: r.midX, y: r.minY),
                   control1: CGPoint(x: r.minX + r.width * 0.02, y: r.maxY - r.height * 0.22),
                   control2: CGPoint(x: r.minX - r.width * (bulge - 0.5), y: r.minY + r.height * 0.18))
        p.closeSubpath()
        return p
    }
}

/// The leaf's midrib and a few veins, drawn over it.
struct LeafVeins: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.midX, y: r.minY + 6))
        p.addLine(to: CGPoint(x: r.midX, y: r.maxY - 6))
        for i in 1...4 {
            let y = r.minY + r.height * Double(i) / 5
            p.move(to: CGPoint(x: r.midX, y: y))
            p.addQuadCurve(to: CGPoint(x: r.minX + r.width * 0.16, y: y - r.height * 0.07), control: CGPoint(x: r.midX - r.width * 0.2, y: y))
            p.move(to: CGPoint(x: r.midX, y: y))
            p.addQuadCurve(to: CGPoint(x: r.maxX - r.width * 0.16, y: y - r.height * 0.07), control: CGPoint(x: r.midX + r.width * 0.2, y: y))
        }
        return p
    }
}

/// Fine pen hatching for the pen-and-ink style (Golden Wood): short slanted strokes in bands
/// down both edges of the leaf, leaving its middle clear for the words box.
struct PenHatching: Shape {
    var gap: CGFloat = 5
    func path(in r: CGRect) -> Path {
        var p = Path()
        let band: CGFloat = r.width * 0.2
        var y: CGFloat = r.minY
        while y < r.maxY {
            p.move(to: CGPoint(x: r.minX, y: y + band * 0.6))
            p.addLine(to: CGPoint(x: r.minX + band, y: y))
            p.move(to: CGPoint(x: r.maxX - band, y: y))
            p.addLine(to: CGPoint(x: r.maxX, y: y + band * 0.6))
            y += gap
        }
        return p
    }
}

/// A small spiral curl, drawn with a pen.
enum PenCurl {
    static func path(at c: CGPoint, radius: CGFloat) -> Path {
        var p = Path()
        var a: CGFloat = 0
        p.move(to: CGPoint(x: c.x + radius, y: c.y))
        while a < 4 * .pi {
            let r: CGFloat = radius * (1 - a / (5 * .pi))
            p.addLine(to: CGPoint(x: c.x + r * cos(a), y: c.y - r * sin(a)))
            a += 0.3
        }
        return p
    }
}

/// A neon box bent from one glass tube: straight Tron-style runs meeting in small, elegant curved
/// corners, with no cut corners or ornaments (Steve, 2026-10-30).
struct NeonFrame: Shape {
    /// A box's corner: a small, smooth bend, never so big the box turns into an oval or a pill.
    var radius: Double = 12
    func path(in r: CGRect) -> Path {
        RoundedRectangle(cornerRadius: min(radius, min(r.width, r.height) / 4), style: .continuous).path(in: r)
    }
}

/// An arched doorway of light (Moonlit Gate), or a tablet's rounded top (the tower).
struct ArchTop: Shape {
    var rise: Double = 0.5
    func path(in r: CGRect) -> Path {
        let h = min(r.width * rise, r.height * 0.4)
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX, y: r.minY + h))
        p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + h), control: CGPoint(x: r.midX, y: r.minY - h * 0.9))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}

/// A scalloped petal edge (Blossom Garden).
struct Scallop: Shape {
    var bump: Double = 14
    func path(in r: CGRect) -> Path {
        var p = Path(roundedRect: r.insetBy(dx: bump / 2, dy: bump / 2), cornerRadius: bump)
        let n = max(3, Int(r.width / (bump * 1.6)))
        for i in 0...n {
            let x = r.minX + bump / 2 + (r.width - bump) * Double(i) / Double(n)
            p.addEllipse(in: CGRect(x: x - bump / 2, y: r.minY, width: bump, height: bump))
            p.addEllipse(in: CGRect(x: x - bump / 2, y: r.maxY - bump, width: bump, height: bump))
        }
        return p
    }
}

/// A small flower or star mark, drawn before comment words on Blossom Garden and Neon Cinderella
/// (`LeafMark` in layouts/motifs.tsx): five petals round a center, or a glowing four-point star.
/// Four points meeting in a narrow waist: Christmas Star's comment mark.
struct FourPointStar: Shape {
    func path(in r: CGRect) -> Path {
        let c = CGPoint(x: r.midX, y: r.midY), w = r.width * 0.14
        var p = Path()
        p.move(to: CGPoint(x: c.x, y: r.minY))
        p.addLine(to: CGPoint(x: c.x + w, y: c.y - w))
        p.addLine(to: CGPoint(x: r.maxX, y: c.y))
        p.addLine(to: CGPoint(x: c.x + w, y: c.y + w))
        p.addLine(to: CGPoint(x: c.x, y: r.maxY))
        p.addLine(to: CGPoint(x: c.x - w, y: c.y + w))
        p.addLine(to: CGPoint(x: r.minX, y: c.y))
        p.addLine(to: CGPoint(x: c.x - w, y: c.y - w))
        p.closeSubpath()
        return p
    }
}

struct Mark: View {
    let shape: LeafShape
    let color: Color
    let center: Color
    var size: Double = 18
    @ScaledMetric private var scale: CGFloat = 1
    private var side: CGFloat { CGFloat(size) * min(scale, 1.5) }

    var body: some View {
        Group {
            switch shape {
            case .flower:
                Canvas { ctx, box in
                    // Explicit CGFloat keeps the type checker fast (older Xcode gives up on the mixed form).
                    let s = CGFloat(size)
                    let p: CGFloat = s * 0.42
                    let r: CGFloat = (s - p) / 2
                    let mid: CGFloat = box.width / 2
                    for deg in stride(from: CGFloat(0), to: 360, by: 72) {
                        let a: CGFloat = (deg - 90) * .pi / 180
                        let x: CGFloat = mid - p / 2 + r * cos(a)
                        let y: CGFloat = mid - p / 2 + r * sin(a)
                        ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: p, height: p)), with: .color(color))
                    }
                    let c: CGFloat = p * 0.8
                    ctx.fill(Path(ellipseIn: CGRect(x: mid - c / 2, y: mid - c / 2, width: c, height: c)), with: .color(center))
                }
                .frame(width: size, height: size)
            case .star:
                // A drawn four-point star (no text glyph or symbol, which the audit reads as text),
                // growing with the words beside it.
                FourPointStar().fill(color).frame(width: side, height: side).shadow(color: color.opacity(0.8), radius: 3)
            default:
                EmptyView()
            }
        }
        .accessibilityHidden(true)
    }
}

extension View {
    /// A soft radiant glow around something already drawn as neon glass.
    func neonTube(_ color: Color) -> some View {
        self.shadow(color: color.opacity(0.7), radius: 6).shadow(color: color.opacity(0.35), radius: 18)
    }
}

/// Real neon glass (Steve, 2026-10-30): close to white in the middle, deeper shades of the color
/// toward the edge of the glass, and a radiant glow around the whole tube.
struct NeonGlass<S: Shape>: View {
    let shape: S
    let color: Color
    var width: CGFloat = 5
    /// How much of the tube is lit, from its start round to its end, so it can draw itself in.
    var progress: CGFloat = 1

    var body: some View {
        let shape = self.shape.trim(from: 0, to: progress)
        return ZStack {
            // The glow the gas throws round the tube.
            shape.stroke(color.opacity(0.45), style: .init(lineWidth: width * 3, lineCap: .round, lineJoin: .round)).blur(radius: width * 2.4)
            shape.stroke(color.opacity(0.6), style: .init(lineWidth: width * 1.6, lineCap: .round, lineJoin: .round)).blur(radius: width * 0.8)
            // The glass: a deeper shade at its edges, the full color, a paler band, then the white-hot core.
            shape.stroke(color, style: .init(lineWidth: width, lineCap: .round, lineJoin: .round))
            shape.stroke(Color.black.opacity(0.3), style: .init(lineWidth: width, lineCap: .round, lineJoin: .round))
            shape.stroke(color, style: .init(lineWidth: width * 0.72, lineCap: .round, lineJoin: .round))
            shape.stroke(Color.white.opacity(0.55), style: .init(lineWidth: width * 0.45, lineCap: .round, lineJoin: .round)).blur(radius: width * 0.08)
            shape.stroke(Color.white.opacity(0.95), style: .init(lineWidth: max(1, width * 0.2), lineCap: .round, lineJoin: .round))
        }
        .compositingGroup()
    }
}

extension View {
    /// The title and tab bar over a skin take its backdrop, with light text on a dark one, so
    /// "Prayers" and the tabs stay readable on a night sky (Moonlit Gate, neon, the wall).
    @ViewBuilder func skinBars(_ backdrop: RGB?) -> some View {
        #if os(iOS)
        if let backdrop {
            let scheme: ColorScheme = BackdropText(on: backdrop).light ? .dark : .light
            self.toolbarBackground(Color(backdrop), for: .navigationBar, .tabBar)
                .toolbarBackground(.visible, for: .navigationBar, .tabBar)
                .toolbarColorScheme(scheme, for: .navigationBar, .tabBar)
        } else {
            self
        }
        #else
        self
        #endif
    }
}
