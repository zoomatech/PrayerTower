import PrayerTowerKit
import SwiftUI

/// Fresh starts on days that matter: up to three of the member's own dates. Only they see them.
/// Shown only while Admin → Growth practices turns fresh-start days on.
struct FreshDaysSection: View {
    @Environment(AppModel.self) private var model
    @State private var days: [FreshStartDay] = []
    @State private var label = ""
    @State private var date = Date()
    @State private var error: String?

    private var parts: (month: Int, day: Int) {
        let c = Calendar.current.dateComponents([.month, .day], from: date)
        return (c.month ?? 1, c.day ?? 1)
    }

    var body: some View {
        Group {
            Text("Save up to three days of your own, like a birthday or a day you began again. On that day, Me offers a fresh start. Only you see them.")
                .font(.footnote).foregroundStyle(.secondary)
            ForEach(days) { d in
                HStack {
                    Text("\(d.label) · \(when(d))")
                    Spacer()
                    Button("Remove", role: .destructive) { Task { await run { try await model.store.api.removeFreshDay(d.id) } } }
                        .accessibilityLabel("Remove \(d.label)")
                }
            }
            if days.count < FreshDayRules.maxDays {
                TextField("What the day is", text: $label)
                    .onChange(of: label) { _, new in if new.count > FreshDayRules.maxLabel { label = String(new.prefix(FreshDayRules.maxLabel)) } }
                // The picker shows a year too; only the month and day are kept.
                DatePicker("Date", selection: $date, displayedComponents: .date)
                Button("Save this day") {
                    Task {
                        let (m, d) = parts
                        await run { try await model.store.api.addFreshDay(month: m, day: d, label: label.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        label = ""
                    }
                }
                .disabled(!FreshDayRules.isValid(month: parts.month, day: parts.day, label: label))
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .task { await run { try await model.store.api.freshDays() } }
    }

    private func when(_ d: FreshStartDay) -> String {
        var c = DateComponents()
        c.year = 2024
        c.month = d.month
        c.day = d.day
        return Calendar.current.date(from: c)?.formatted(.dateTime.month(.wide).day()) ?? "\(d.month)/\(d.day)"
    }

    private func run(_ f: () async throws -> [FreshStartDay]) async {
        do {
            days = try await f()
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}
