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
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        NavigationStack {
            List {
                if let profile = model.me?.profile {
                    Section { header(profile) }
                    Section { counts(profile) } footer: { Text(w("profile.tokensNote")) }
                }
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
                StaffSection()
                if let error { Section { Text(error).foregroundStyle(.red) } }
                Section {
                    NavigationLink(w("notifySettings.title")) { NotificationSettingsView() }
                    NavigationLink(w("profile.scheduled")) { ScheduledGiftsView() }
                }
                Section {
                    NavigationLink("Sign-in security") { SignInSecurityView() }
                    Button(w(exporting ? "profile.exporting" : "profile.export")) { Task { await export() } }.disabled(exporting)
                    Button(w("profile.signOut"), role: .destructive) {
                        Task {
                            await model.store.signOut()
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
                Text(why.map { w("enums.whyHere.\($0)") }.joined(separator: " · ")).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private func counts(_ p: Profile) -> some View {
        if let countsError {
            Text(countsError).foregroundStyle(.red)
            Button(w("common.tryAgain")) { Task { await loadCounts() } }
        }
        HStack(alignment: .top) {
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
        VStack(spacing: 2) {
            Text(value).font(.title3.bold()).lineLimit(2).minimumScaleFactor(0.6)
            Text(label).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
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
                Text(w("deleteAccount.keep")).font(.footnote).foregroundStyle(.secondary)
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
            await WidgetBridge.update(nil, model: model)
            model.state = .signedOut
        } catch {
            self.error = error.localizedDescription
            busy = false
        }
    }
}
