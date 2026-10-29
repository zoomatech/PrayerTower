import PrayerTowerKit
import SwiftUI

/// Me → Kind words practice (`empathyPractice`): this week's made-up moment and three replies;
/// tapping one shows gently how it might land. Nothing tapped leaves the phone.
struct KindWordsSection: View {
    @Environment(AppModel.self) private var model
    @State private var picked: Int?

    private var w: Words { model.words }

    var body: some View {
        if model.features["empathyPractice"] {
            let k = KindWords.keys(for: Date())
            Section {
                Text(w("kindWords.intro")).font(.footnote)
                Text(w(k.situation))
                ForEach(0..<3, id: \.self) { i in
                    Button {
                        picked = i
                        AccessibilityNotification.Announcement(w(k.replies[i].note)).post()
                    } label: {
                        HStack(alignment: .firstTextBaseline) {
                            Image(systemName: picked == i ? "largecircle.fill.circle" : "circle").accessibilityHidden(true)
                            Text(w(k.replies[i].reply)).multilineTextAlignment(.leading)
                        }
                    }
                    .accessibilityAddTraits(picked == i ? .isSelected : [])
                }
                if let i = picked { Text(w(k.replies[i].note)).font(.footnote) }
            } header: {
                Text(w("kindWords.title"))
            }
        }
    }
}
