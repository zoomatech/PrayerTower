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

/// A frame with cut corners, like a bent neon tube (Neon Cinderella).
struct CutCorners: Shape {
    var cut: Double = 12
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX + cut, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX - cut, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.minY + cut))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - cut))
        p.addLine(to: CGPoint(x: r.maxX - cut, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX + cut, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX, y: r.maxY - cut))
        p.addLine(to: CGPoint(x: r.minX, y: r.minY + cut))
        p.closeSubpath()
        return p
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
struct Mark: View {
    let shape: LeafShape
    let color: Color
    let center: Color
    var size: Double = 18

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
                Text("✦").font(.system(size: size)).foregroundStyle(color).neonTube(color)
            default:
                EmptyView()
            }
        }
        .accessibilityHidden(true)
    }
}

extension View {
    /// The tube look shared by the neon styles: a faint wide bloom, a brighter halo and a thin white core.
    func neonTube(_ color: Color) -> some View {
        self.shadow(color: color.opacity(0.9), radius: 3).shadow(color: color.opacity(0.5), radius: 10).shadow(color: color.opacity(0.25), radius: 22)
    }
}
