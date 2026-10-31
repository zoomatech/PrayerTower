import PrayerTowerKit
import SwiftUI

/// On the author's own prayer request (`prayerResolution`): "Has this prayer been answered?". Yes
/// opens the two-answer survey; "Not yet" offers to repost or reword it, and a free broadcast token.
struct ResolutionSection: View {
    @Environment(AppModel.self) private var model
    let postId: String
    var onChanged: () -> Void = {}
    @State private var status: ResolutionStatus?
    @State private var survey = false
    @State private var rewording = false
    @State private var words = ""
    @State private var reposted: String?
    @State private var note: String?
    @State private var error: String?
    @State private var busy = false

    private var w: Words { model.words }

    var body: some View {
        Group {
            if let s = status, s.showsCard || note != nil || reposted != nil {
                Section {
                    if s.pending {
                        if survey {
                            ForEach(ResolutionOutcome.allCases, id: \.self) { o in
                                Button(w(o.wordKey)) { act { try await answer(o) } }.disabled(busy)
                            }
                            Button(w("resolution.back")) { survey = false }
                        } else {
                            Button(w("resolution.yes")) { survey = true }
                            Button(w("resolution.notYet")) { act { try await answer(nil) } }.disabled(busy)
                        }
                    }
                    if s.offersRepost {
                        Text(w("resolution.notYetIntro")).font(.footnote)
                        if rewording {
                            TextField(w("resolution.rewordLabel"), text: $words, axis: .vertical)
                                .accessibilityLabel(w("resolution.rewordLabel"))
                                .onChange(of: words) { words = String(words.prefix(10_000)) }
                            Button(w("resolution.rewordSend")) { act { try await repost(words) } }
                                .disabled(busy || words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            Button(w("resolution.back")) { rewording = false }
                        } else {
                            Button(w("resolution.repost")) { act { try await repost(nil) } }.disabled(busy)
                            Button(w("resolution.reword")) { rewording = true }
                        }
                    }
                    if s.offersToken {
                        Text(w("resolution.tokenOffer", count: s.freeTokens)).font(.footnote)
                        Button(w("resolution.tokenTake")) { act { try await takeToken() } }.disabled(busy)
                    }
                    if let reposted {
                        Text(w("resolution.reposted")).foregroundStyle(.tint)
                        NavigationLink(w("resolution.open")) { PostDetailView(postId: reposted) }
                    }
                    if let note { Text(note).foregroundStyle(.tint) }
                    if let error { Text(error).foregroundStyle(.red) }
                } header: {
                    if s.pending { Text(w(survey ? "resolution.surveyTitle" : "resolution.title")) }
                }
            }
        }
        .task(id: postId) { status = try? await model.store.api.resolution(postId: postId) }
    }

    private func act(_ work: @escaping () async throws -> Void) {
        Task {
            busy = true
            defer { busy = false }
            do {
                error = nil
                try await work()
            } catch { self.error = error.localizedDescription }
        }
    }

    private func answer(_ outcome: ResolutionOutcome?) async throws {
        status = try await model.store.api.answerResolution(postId: postId, outcome: outcome)
        survey = false
        if outcome != nil {
            note = w("resolution.answeredThanks")
            AccessibilityNotification.Announcement(w("resolution.answeredThanks")).post()
        }
        onChanged()
    }

    private func repost(_ text: String?) async throws {
        let card = try await model.store.api.repostResolution(postId: postId, body: text)
        reposted = card.id
        rewording = false
        status?.canRepost = false
        status?.repostedPostId = card.id
        AccessibilityNotification.Announcement(w("resolution.reposted")).post()
    }

    private func takeToken() async throws {
        _ = try await model.store.api.claimResolutionToken(postId: postId)
        status?.freeTokens = 0
        status?.tokenClaimed = true
        note = w("resolution.tokenTaken")
        AccessibilityNotification.Announcement(w("resolution.tokenTaken")).post()
    }
}

/// Admin → Settings: answered prayers from the check-ins, and whether each was prayercast by radio.
struct ResolutionReportView: View {
    @Environment(AppModel.self) private var model
    @State private var report: ResolutionReport?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.red) }
            if let r = report {
                let n = r.totals
                Section {
                    Text(w("resolution.reportTotals", [
                        "asked": "\(n["asked"] ?? 0)", "answered": "\(n["answered"] ?? 0)", "hoped": "\(n["hoped"] ?? 0)",
                        "hisWill": "\(n["his_will"] ?? 0)", "notYet": "\(n["not_yet"] ?? 0)", "reposted": "\(n["reposted"] ?? 0)", "tokens": "\(n["free_tokens"] ?? 0)",
                    ]))
                    Text(w("resolution.reportPrayercast", count: n["answered_prayercast"] ?? 0))
                }
                Section {
                    if r.answered.isEmpty { Text(w("resolution.reportEmpty")) }
                    ForEach(r.answered) { a in
                        VStack(alignment: .leading) {
                            Text(a.who ?? "—")
                            Text(w(a.outcome.shortKey)).font(.footnote)
                            Text(a.prayercast ? w("resolution.cast", count: a.prayercastCount) : w("resolution.notCast")).font(.footnote).foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
        .navigationTitle(w("resolution.reportTitle"))
        .task {
            do { report = try await model.store.api.resolutionReport() } catch { self.error = error.localizedDescription }
        }
    }
}
