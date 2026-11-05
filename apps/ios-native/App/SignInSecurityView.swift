import PrayerTowerKit
import PrayerTowerSession
import SwiftUI

/// Me → Sign-in security: two-step sign-in, backup codes and passkeys, as on the Expo app's
/// Password and email screen. Each part follows its admin switch (`twoStep`, `backupCodes`, `passkeys`).
struct SignInSecurityView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Form {
            TwoStepSection()
            if model.features["backupCodes"] { BackupCodesSection() }
            if model.features["passkeys"] { PasskeysSection() }
        }
        .navigationTitle("Sign-in security")
    }
}

struct TwoStepSection: View {
    @Environment(AppModel.self) private var model
    @State private var on: Bool?
    @State private var setup: TwoStepSetup?
    @State private var code = ""
    @State private var notice: String?
    @State private var error: String?

    var body: some View {
        // Hidden while switched off, unless the member already uses it (they keep it).
        if let on, on || model.features["twoStep"] {
            Section {
                if let setup {
                    Text("Add this account to your authenticator app, then type the 6-digit code it shows.")
                    if let url = URL(string: setup.uri) { Link("Add to my authenticator app", destination: url) }
                    LabeledContent("Or type this key into the app:") { Text(setup.secret).font(.body.monospaced()).textSelection(.enabled) }
                    TextField("6-digit code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                    Button("Turn on") { Task { await finish(setup) } }.disabled(code.trimmingCharacters(in: .whitespaces).count != 6)
                } else if on {
                    Text("Two-step sign-in is on.")
                    Button("Turn off two-step sign-in", role: .destructive) { Task { await turnOff() } }
                } else {
                    Text("Add a code from an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password) after your password, so nobody can sign in with your password alone.")
                    Button("Turn on two-step sign-in") { Task { await start() } }
                }
                if let notice { Text(notice) }
                if let error { Text(error).foregroundStyle(Color.danger) }
            } header: {
                Text("Two-step sign-in")
            }
        } else {
            Color.clear.frame(height: 0).task { on = await model.store.twoStepOn() }
        }
    }

    private func start() async {
        do {
            setup = try await model.store.startTwoStep(issuer: "Prayer Tower")
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func finish(_ s: TwoStepSetup) async {
        do {
            try await model.store.finishTwoStep(s, code: code)
            setup = nil
            code = ""
            on = true
            notice = model.features["backupCodes"]
                ? "Two-step sign-in is on. You will need a code from the app each time you sign in. Make backup codes below in case you lose your phone."
                : "Two-step sign-in is on. You will need a code from the app each time you sign in."
            error = nil
        } catch {
            code = ""
            self.error = error.localizedDescription
        }
    }

    private func turnOff() async {
        do {
            try await model.store.turnOffTwoStep()
            on = false
            notice = "Two-step sign-in is off."
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct BackupCodesSection: View {
    @Environment(AppModel.self) private var model
    @State private var remaining: Int?
    @State private var codes: [String]?
    @State private var error: String?

    var body: some View {
        Section {
            if let codes {
                Text("Save these now. You won’t see them again. Each code works once.")
                Text(codes.joined(separator: "\n"))
                    .font(.body.monospaced())
                    .textSelection(.enabled)
                    .accessibilityLabel("\(codes.count) backup codes")
                ShareLink("Save or share as text", item: "Backup codes for two-step sign-in. Each works once. Keep them private.\n\n" + codes.joined(separator: "\n") + "\n")
                Button("I saved them") { self.codes = nil }
            } else {
                if let remaining, remaining > 0 {
                    Text("\(remaining) unused backup codes. Each works once.")
                } else {
                    Text("If you lose your phone, a backup code gets you back in. Make a set and keep it somewhere safe, like a password manager or a printed page.")
                }
                Button((remaining ?? 0) > 0 ? "Make new codes" : "Make backup codes") { Task { await make() } }
                if (remaining ?? 0) > 0 { Text("Making new codes stops the old ones from working.").font(.footnote) }
            }
            if let error { Text(error).foregroundStyle(Color.danger) }
        } header: {
            Text("Backup codes")
        }
        .task { await load() }
    }

    private func load() async {
        do {
            let s = try await model.store.api.backupCodes()
            remaining = s.enabled ? s.remaining : nil
        } catch { self.error = error.localizedDescription }
    }

    private func make() async {
        do {
            codes = try await model.store.api.makeBackupCodes().codes
            error = nil
            await load()
        } catch { self.error = error.localizedDescription }
    }
}

struct PasskeysSection: View {
    @Environment(AppModel.self) private var model
    @State private var list: [Passkey] = []
    @State private var notice: String?
    @State private var error: String?

    var body: some View {
        Section {
            Text("Sign in with Face ID, Touch ID or a security key instead of typing your password.")
            ForEach(list) { p in
                HStack {
                    Text(p.name ?? "Passkey")
                    Spacer()
                    Text(p.createdAt, style: .date).foregroundStyle(Color.subtle)
                }
                .swipeActions { Button("Remove", role: .destructive) { Task { await remove(p) } } }
            }
            Button("Add a passkey") { Task { await add() } }
            if let notice { Text(notice) }
            if let error { Text(error).foregroundStyle(Color.danger) }
        } header: {
            Text("Passkeys")
        }
        .task { await load() }
    }

    private func load() async {
        do { list = try await model.store.passkeys() } catch { self.error = error.localizedDescription }
    }

    private func add() async {
        guard let window = presentationWindow() else { return }
        do {
            try await model.store.addPasskey(from: window)
            notice = "Passkey added. Next time, choose “Use a passkey” on the sign-in screen."
            error = nil
            await load()
        } catch { self.error = error.localizedDescription }
    }

    private func remove(_ p: Passkey) async {
        do {
            try await model.store.removePasskey(p.id)
            await load()
        } catch { self.error = error.localizedDescription }
    }
}
