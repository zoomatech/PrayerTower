import PrayerTowerKit
import SwiftUI

/// My Promises, as the Expo app's commitments tab: the week in kindness, each active promise with
/// check in, snooze and edit, then past promises and the "we do not judge" note.
struct CommitmentsView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [Commitment] = []
    @State private var review: WeeklyReview?
    @State private var note = ""
    @State private var loaded = false
    @State private var editing: Draft?
    @State private var opened: String?
    @State private var error: String?

    struct Draft: Equatable {
        let id: String
        var vowText: String
        var frequency: String
        var completedCount: Int
    }

    private var w: Words { model.words }

    var body: some View {
        NavigationStack {
            List {
                if let review {
                    Section(w("promises.week")) { Text(review.message) }
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(.red)
                        Button(w("common.tryAgain")) { Task { await load() } }
                    }
                }
                let active = items.filter(\.isActive)
                if loaded && active.isEmpty {
                    Section { Text(w("promises.empty")).foregroundStyle(Color.subtle) }
                }
                if model.features["checkinAffirmation"] && !active.isEmpty {
                    Section { Text(w("promises.affirmation")).font(.footnote) }
                }
                ForEach(active) { c in Section { row(c) } }
                let past = items.filter { !$0.isActive }
                if !past.isEmpty {
                    Section(w("promises.past")) {
                        ForEach(past) { c in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(c.postExcerpt ?? "")
                                Text("\(w(c.status == "completed" ? "promises.completed" : "promises.ended")) · \(w("promises.prayedTimes", count: c.completedCount))")
                                    .font(.caption).foregroundStyle(Color.subtle)
                            }
                            .opacity(0.7)
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
                if !note.isEmpty {
                    Section { Text(note).font(.footnote).foregroundStyle(Color.subtle).frame(maxWidth: .infinity) }
                }
            }
            .overlay { if !loaded && error == nil { ProgressView() } }
            .navigationTitle(w("tabs.promises"))
            .navigationDestination(item: $opened) { PostDetailView(postId: $0) }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    @ViewBuilder private func row(_ c: Commitment) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(w("enums.frequency.\(c.frequency)")).font(.caption).foregroundStyle(Color.subtle)
            Button(c.postExcerpt ?? "") { opened = c.postId }.buttonStyle(.plain)
            Text("“\(c.vowText)”").italic().foregroundStyle(.tint)
            Text(progress(c)).font(.caption).foregroundStyle(Color.subtle)
        }
        if let draft = editing, draft.id == c.id {
            editor(c, Binding(get: { editing ?? draft }, set: { editing = $0 }))
        } else {
            HStack {
                Button(w("feed.prayed")) { Task { await act { _ = try await model.store.api.checkIn(c.id) } } }
                    .buttonStyle(.borderedProminent)
                Button(w("promises.snooze")) { Task { await act { _ = try await model.store.api.snooze(c.id) } } }
                    .buttonStyle(.bordered)
                Button(w("promises.edit")) {
                    editing = Draft(id: c.id, vowText: c.vowText, frequency: c.frequency, completedCount: c.completedCount)
                }
                .buttonStyle(.borderless)
            }
        }
    }

    @ViewBuilder private func editor(_ c: Commitment, _ d: Binding<Draft>) -> some View {
        TextField(w("actions.promise"), text: d.vowText, axis: .vertical)
            .lineLimit(2...6)
            .onChange(of: d.wrappedValue.vowText) { _, new in if new.count > Commitments.maxVow { d.wrappedValue.vowText = String(new.prefix(Commitments.maxVow)) } }
        Picker(w("actions.howOften"), selection: d.frequency) {
            ForEach(Commitments.frequencies, id: \.self) { Text(w("enums.frequency.\($0)")).tag($0) }
        }
        Stepper(w("promises.times", count: d.wrappedValue.completedCount), value: d.completedCount, in: 0...10_000)
        Text(w("promises.recordNote")).font(.footnote).foregroundStyle(Color.subtle)
        Button(w("promises.save")) {
            let e = d.wrappedValue
            Task { await act { _ = try await model.store.api.editCommitment(c.id, CommitmentEdit(frequency: e.frequency, vowText: e.vowText, completedCount: e.completedCount)) }; editing = nil }
        }
        .disabled(d.wrappedValue.vowText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        Button(w("promises.complete")) { Task { await act { _ = try await model.store.api.editCommitment(c.id, CommitmentEdit(status: "completed")) }; editing = nil } }
        Button(w("promises.end"), role: .destructive) { Task { await act { _ = try await model.store.api.editCommitment(c.id, CommitmentEdit(status: "cancelled")) }; editing = nil } }
        Button(w("common.cancel")) { editing = nil }
    }

    private func progress(_ c: Commitment) -> String {
        var s = w("promises.progress", ["done": String(c.completedCount), "total": String(c.committedCount)])
        if let next = c.nextReminderAt.flatMap(Self.date) {
            s += " · " + w("promises.next", ["when": next.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute())])
        }
        return s
    }

    private static func date(_ s: String) -> Date? {
        (try? Date(s, strategy: .iso8601)) ?? (try? Date(s, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
    }

    private func load() async {
        let api = model.store.api
        do {
            async let list = api.commitments()
            async let week = api.weeklyReview()
            let (l, r) = try await (list, week)
            items = l.commitments
            note = l.note
            review = r
            loaded = true
            error = nil
        } catch let e as APIError where e.signedOut {
            model.state = .signedOut
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func act(_ work: () async throws -> Void) async {
        do { try await work() } catch { self.error = error.localizedDescription }
        await load()
    }
}

/// "Commit to Regular Prayer" from a card's action row: the promise, how often, and for how many days.
struct CommitSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let card: Card
    let done: (String) -> Void
    @State private var text = ""
    @State private var frequency = "daily"
    @State private var days = ""
    @State private var busy = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        NavigationStack {
            Form {
                Section { Text(card.preview).foregroundStyle(Color.subtle) }
                Section(w("actions.promise")) {
                    TextField(w("actions.promise"), text: $text, axis: .vertical)
                        .lineLimit(2...6)
                        .onChange(of: text) { _, new in if new.count > Commitments.maxVow { text = String(new.prefix(Commitments.maxVow)) } }
                }
                Section {
                    Picker(w("actions.howOften"), selection: $frequency) {
                        ForEach(Commitments.frequencies, id: \.self) { Text(w("enums.frequency.\($0)")).tag($0) }
                    }
                    .pickerStyle(.inline)
                } header: { Text(w("actions.howOften")) }
                Section {
                    TextField(w("actions.days"), text: $days)
                        .keyboardType(.numberPad)
                        .onChange(of: days) { _, new in days = String(new.filter(\.isNumber).prefix(3)) }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .navigationTitle(w("actions.commitTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(w("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(w("actions.commit")) { Task { await commit() } }
                        .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear { if text.isEmpty { text = Commitments.defaultVow(for: card, words: w) } }
        }
    }

    private func commit() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await model.store.api.commit(postId: card.id, NewCommitment(frequency: frequency, vowText: text, durationDays: Commitments.days(days)))
            done(w("actions.commitDone"))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
