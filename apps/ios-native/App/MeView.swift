import PrayerTowerKit
import SwiftUI
import UniformTypeIdentifiers

/// Me, as the Expo app's profile tab: the member's tier and tokens, their settings, and their
/// account (sign-in security, download my data, sign out, delete my account).
struct MeView: View {
    @Environment(AppModel.self) private var model
    @State private var freshDay: FreshDay?
    @State private var tier: TierStatus?
    @State private var tokens: TokenSummary?
    @State private var countsError: String?
    @State private var exportFile: ExportFile?
    @State private var exporting = false
    @State private var listenOpen = false
    @State private var error: String?
    @Environment(\.dynamicTypeSize) private var typeSize

    private var w: Words { model.words }

    var body: some View {
        NavigationStack {
            List {
                if let profile = model.me?.profile {
                    Section { header(profile) }
                    Section { counts(profile) } footer: { Text(w("profile.tokensNote")) }
                }
                PrayerLifeSection()
                GratitudeSection()
                KindWordsSection()
                EncouragerSection()
                FeedStyleSection()
                if model.features["skinGallery"] || model.features["themeProposals"] {
                    Section {
                        if model.features["skinGallery"] { NavigationLink("Skin gallery") { SkinGalleryView() } }
                        if model.features["themeProposals"] { NavigationLink("Make your own feed skin") { ThemeMakerView() } }
                    }
                }
                if model.features["freshDays"] {
                    if let line = freshDay?.line { Section { Text(line) } }
                    Section { FreshDaysSection() } header: { Text("Days that matter") }
                }
                if let profile = model.me?.profile {
                    Section(w("profile.settings")) {
                        ForEach(ProfileSettings.switches(for: profile)) { s in
                            Toggle(isOn: Binding(get: { ProfileSettings.value(s.field, in: profile) }, set: { on in Task { await update(s.field, on) } })) {
                                Text(w(s.label))
                                if let hint = s.hint { Text(w(hint)) }
                            }
                        }
                    }
                }
                ConversationPrefsSection()
                ToolsSection()
                ExtrasSection()
                MoreToolsSection()
                StaffSection()
                if let error { Section { Text(error).foregroundStyle(.red) } }
                Section {
                    NavigationLink(w("notifySettings.title")) { NotificationSettingsView() }
                    NavigationLink(w("profile.scheduled")) { ScheduledGiftsView() }
                    if model.features["library"] { NavigationLink(w("library.title")) { LibraryView() } }
                    if model.features["libraryParallels"] { NavigationLink(w("library.parallels")) { ParallelsView() } }
                    if model.features["libraryPlans"] { NavigationLink(w("library.plans")) { ReadingPlansView() } }
                    if model.features["libraryNotes"] { NavigationLink(w("library.notesTitle")) { MyNotesView() } }
                    if model.features["libraryOffline"] { NavigationLink(w("library.offlineTitle")) { OfflineTextsView() } }
                }
                if model.me?.roles.contains("admin") == true {
                    Section { NavigationLink(w("starter.title")) { AdminKindnessView() } }
                }
                Section {
                    if model.features["remembered"] { NavigationLink(w("practices.lookBack")) { RememberedView() } }
                    if model.features["kindnessHighlights"] { NavigationLink(w("highlightsKind.title")) { HighlightsView() } }
                    NavigationLink(w("helpStories.title")) { HelpStoriesView() }
                }
                Section {
                    if model.features["safetyCenter"] { NavigationLink(w("safetyCenter.title")) { SafetyCenterView() } }
                    NavigationLink(w("profile.rules")) { RulesView() }
                    Button(w("profile.tour")) { model.showTour = true }
                    NavigationLink(w("profile.feedback")) { FeedbackView() }
                }
                Section {
                    NavigationLink(w("accountSecurity.title")) { AccountSecurityView() }
                    NavigationLink("Sign-in security") { SignInSecurityView() }
                    if model.features["signalQueue"] && model.me?.community?.shows("radio") ?? true {
                        NavigationLink(w("signalQueue.title")) { SignalQueueView() }
                    }
                    // Listener mode: shown once Admin → Radio has the listening page on.
                    if listenOpen && model.me?.community?.shows("radio") ?? true {
                        NavigationLink(w("listen.title")) { ListenView(api: model.store.api, words: w, sample: SampleServer.isOn()) }
                    }
                    Button(w(exporting ? "profile.exporting" : "profile.export")) { Task { await export() } }.disabled(exporting)
                    Button(w("profile.signOut"), role: .destructive) {
                        Task {
                            await model.store.signOut()
                            await OfflineStore.shared.clear()
                            await WidgetBridge.update(nil, model: model)
                            model.state = .signedOut
                        }
                    }
                    NavigationLink(w("profile.deleteAccount")) { DeleteAccountView() }
                }
            }
            .navigationTitle(w("tabs.me"))
            .refreshable { await loadCounts() }
            .task { await loadCounts() }
            .task { listenOpen = (try? await model.store.api.listenConfig().enabled) ?? false }
            .task(id: model.features["freshDays"]) {
                freshDay = model.features["freshDays"] ? (try? await model.store.api.freshDayToday()) ?? nil : nil
            }
            .sheet(item: $exportFile) { file in ShareLink(item: file.url) { Label(w("profile.export"), systemImage: "square.and.arrow.up") }.padding() }
        }
    }

    @ViewBuilder private func header(_ p: Profile) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(p.displayName.isEmpty ? w("profile.me") : p.displayName).font(.title2.bold())
            if let why = p.whyHere, !why.isEmpty {
                Text(why.map { w("enums.whyHere.\($0)") }.joined(separator: " · ")).font(.footnote).foregroundStyle(Color.subtle)
            }
        }
    }

    @ViewBuilder private func counts(_ p: Profile) -> some View {
        if let countsError {
            Text(countsError).foregroundStyle(.red)
            Button(w("common.tryAgain")) { Task { await loadCounts() } }
        }
        // Four across, or one under another at the accessibility text sizes so nothing shrinks.
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(alignment: .top))
        layout {
            stat(tier?.tier.map { w.server($0.label) } ?? "—", w(p.anonymousByDefault == true ? "profile.tierPrivate" : "profile.tier"))
            stat("\(tier?.prayers ?? 0)", w("profile.prayers"))
            stat("\(tokens?.balance ?? 0)", w("profile.tokens"))
            stat("\(tokens?.priestly.balance ?? 0)", w("profile.priestly"))
        }
        if let upkeep = tier?.upkeep {
            Text(upkeep.held.map { w("profile.tierHeld", ["tier": w.server($0.label)]) } ?? w("profile.tierUpkeep", ["days": String(upkeep.days)]))
                .font(.footnote)
        }
        if let next = tier?.next {
            Text(w("profile.nextTier", ["tier": w.server(next.label)], count: next.prayersNeeded)).font(.footnote)
        }
        if let t = tokens {
            Text(w("profile.priestlyProgress", ["done": String(t.priestly.towardNext), "per": String(t.priestly.prayersPerToken)])).font(.footnote)
            if t.priestly.balance > 0 {
                Button(w("profile.donatePriestly")) {
                    Task {
                        do {
                            _ = try await model.store.api.donatePriestly()
                            tokens = try await model.store.api.tokens()
                        } catch {
                            self.error = error.localizedDescription
                        }
                    }
                }
            }
        }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        let big = typeSize.isAccessibilitySize
        return VStack(alignment: big ? .leading : .center, spacing: 2) {
            // Never shrunk below the member's text size (the accessibility audit counts that as clipped).
            Text(value).font(.title3.bold()).lineLimit(nil).fixedSize(horizontal: false, vertical: true)
            Text(label).font(.caption2).foregroundStyle(Color.subtle).multilineTextAlignment(big ? .leading : .center)
        }
        .frame(maxWidth: .infinity, alignment: big ? .leading : .center)
        .accessibilityElement(children: .combine)
    }

    private func loadCounts() async {
        // If the counts can't load, say so instead of showing zeros that look real.
        countsError = nil
        tier = try? await model.store.api.tier()
        do { tokens = try await model.store.api.tokens() } catch { countsError = error.localizedDescription }
    }

    private func update(_ field: String, _ on: Bool) async {
        guard let me = model.me else { return }
        do {
            let profile = try await model.store.api.updateMe(ProfileSettings.patch(field, on: on))
            model.me = Me(profile: profile, roles: me.roles, community: me.community)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func export() async {
        exporting = true
        defer { exporting = false }
        do {
            let data = try await model.store.api.exportMyData()
            let day = String(ISO8601DateFormatter().string(from: .now).prefix(10))
            let name = "\(model.wording == .neutral ? "open-circle" : "prayer-tower")-data-\(day).json"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            try data.write(to: url, options: .completeFileProtection)
            exportFile = ExportFile(url: url)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ExportFile: Identifiable {
    let url: URL
    var id: URL { url }
}

/// Delete my account: easy to find from Me, one typed confirmation, done at once.
struct DeleteAccountView: View {
    @Environment(AppModel.self) private var model
    @State private var confirm = ""
    @State private var busy = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        Form {
            Section {
                Text(w("deleteAccount.intro"))
                Text(w("deleteAccount.list"))
                Text(w("deleteAccount.keep")).font(.footnote).foregroundStyle(Color.subtle)
            }
            Section(w("deleteAccount.confirm")) {
                TextField("DELETE", text: $confirm)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section {
                Button(w("profile.deleteAccount"), role: .destructive) { Task { await remove() } }
                    .disabled(busy || confirm.trimmingCharacters(in: .whitespaces) != "DELETE")
            }
        }
        .navigationTitle(w("profile.deleteAccount"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func remove() async {
        busy = true
        do {
            _ = try await model.store.api.deleteAccount()
            await model.store.signOut()
            await OfflineStore.shared.clear()
            await WidgetBridge.update(nil, model: model)
            model.state = .signedOut
        } catch {
            self.error = error.localizedDescription
            busy = false
        }
    }
}
