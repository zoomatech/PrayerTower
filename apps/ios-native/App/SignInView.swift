import PrayerTowerKit
import PrayerTowerSession
import SwiftUI
import AuthenticationServices
#if os(iOS)
import UIKit
#endif

/// The window the system passkey sheet is shown from.
@MainActor
func presentationWindow() -> ASPresentationAnchor? {
    #if os(iOS)
    UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow)
    #else
    NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first
    #endif
}

struct SignInView: View {
    enum Mode { case signIn, signUp, forgot }

    @Environment(AppModel.self) private var model
    @State private var mode = Mode.signIn
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var invite = ""
    @State private var code = ""
    @State private var resetSent = false
    /// The reset code was accepted: choose a new password before going in.
    @State private var choosing = false
    @State private var again = ""
    @State private var busy = false
    @State private var notice: String?
    @State private var error: String?
    /// Invite-only, passkeys and backup codes follow Admin (public sign-in settings).
    @State private var config = SignupConfig(inviteOnly: true)

    private var w: Words { model.words }

    var body: some View {
        Form {
            Section {
                DecorativeGlyph(glyph: "🕊", size: 44)
                Text(w.server("Prayer Tower")).font(.largeTitle.bold())
                Text(w("signIn.tagline")).foregroundStyle(Color.subtle)
            }
            switch mode {
            case .forgot: forgot
            default: account
            }
            if let error { Text(error).foregroundStyle(Color.danger) }
            if let notice { Text(notice) }
        }
        .task { config = (try? await model.store.api.signupConfig()) ?? SignupConfig(inviteOnly: true) }
        .onChange(of: model.invite, initial: true) { _, code in
            // An invite link opens straight to sign-up with the code filled in.
            guard let code else { return }
            invite = code
            switchMode(.signUp)
            model.invite = nil
        }
    }

    @ViewBuilder private var account: some View {
        Section {
            if mode == .signUp {
                TextField(w("signIn.name"), text: $name).textContentType(.name)
                if config.inviteOnly {
                    TextField(w("signIn.inviteCode"), text: $invite, prompt: Text(w("signIn.invitePlaceholder")))
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }
            }
            TextField(w("signIn.email"), text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
            SecureField(w("signIn.password"), text: $password)
                .textContentType(mode == .signUp ? .newPassword : .password)
        }
        Section {
            // Never grayed out (a disabled button's gray text fails contrast); a tap with something
            // missing says what to fill in.
            Button(w(mode == .signIn ? "signIn.signIn" : "signIn.createAccount")) {
                guard ready else {
                    if !busy { error = w.server("Enter your email and a password of at least 6 characters.") }
                    return
                }
                Task { await submit() }
            }
            if mode == .signUp && config.inviteOnly { Text(w("signIn.inviteHint")).font(.footnote) }
            if mode == .signUp { LegalLinksView(prefix: w("signIn.legalPrefix")) }
            if mode == .signIn && config.passkeys {
                Button {
                    Task { await passkey() }
                } label: {
                    Label("Use a passkey", systemImage: "person.badge.key")
                }
                .disabled(busy)
            }
            if mode == .signIn {
                // The same plain row button as the switch below it, which grows with the text.
                Button(w("signIn.forgot")) { switchMode(.forgot) }
            }
            Button(w(mode == .signIn ? "signIn.toSignUp" : "signIn.toSignIn")) { switchMode(mode == .signIn ? .signUp : .signIn) }
        }
    }

    @ViewBuilder private var forgot: some View {
        if choosing {
            Section { Text(w("accountSecurity.chooseNew")).font(.headline) }
            NewPasswordSection(password: $password, again: $again) {
                Task {
                    await run {
                        try await model.store.setPassword(password)
                        model.state = await model.store.current()
                    }
                }
            }
            Button(w("accountSecurity.cancelReset"), role: .destructive) {
                Task {
                    await model.store.signOut()
                    choosing = false
                    switchMode(.signIn)
                }
            }
        } else {
            Section(w("signIn.forgotTitle")) {
                Text(w(resetSent ? "signIn.resetSent" : "signIn.forgotIntro"))
                TextField(w("signIn.email"), text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .disabled(resetSent)
                if resetSent {
                    TextField(w("signIn.resetCode"), text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                    Button(w("signIn.resetContinue")) {
                        Task { await run { try await model.store.verifyResetCode(email: email, code: code); choosing = true } }
                    }
                    .disabled(busy || code.trimmingCharacters(in: .whitespaces).count < 6)
                    Button(w("signIn.resetAgain")) { resetSent = false }
                } else {
                    Button(w("signIn.resetSend")) { Task { await run { try await model.store.sendPasswordReset(email: email); resetSent = true } } }
                        .disabled(busy || !email.contains("@"))
                }
            }
            Button(w("signIn.toSignIn")) { switchMode(.signIn) }
        }
    }

    private var ready: Bool {
        guard !busy, email.contains("@") else { return false }
        if mode == .signIn { return password.count >= 6 }
        let named = !name.trimmingCharacters(in: .whitespaces).isEmpty
        return password.count >= 8 && named && (!config.inviteOnly || !invite.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    private func switchMode(_ next: Mode) {
        mode = next
        error = nil
        notice = nil
        resetSent = false
        code = ""
    }

    private func submit() async {
        await run {
            if mode == .signIn {
                model.state = try await model.store.signIn(email: email, password: password)
            } else if let state = try await model.store.signUp(email: email, password: password, name: name, invite: invite, openCircle: model.edition == .openCircle || model.wording == .neutral) {
                model.state = state
            } else {
                notice = w("signIn.checkEmail")
            }
        }
    }

    private func passkey() async {
        guard let window = presentationWindow() else { return }
        await run { model.state = try await model.store.signInWithPasskey(from: window) }
    }

    private func run(_ step: () async throws -> Void) async {
        busy = true
        defer { busy = false }
        do {
            try await step()
            error = nil
        } catch {
            // The two refusals from the invite check, in the app's words.
            switch error.localizedDescription {
            case "Prayer Tower is invite-only right now. Enter your invite code.": self.error = w("signIn.inviteNeeded")
            case "That invite code is not valid. Check it, or ask for a new one.": self.error = w("signIn.inviteInvalid")
            default: self.error = error.localizedDescription
            }
        }
    }
}

/// The second step of signing in: the 6-digit code from the authenticator app, or a backup
/// code after a lost phone (which turns two-step sign-in off so it can be set up again).
struct CodeView: View {
    @Environment(AppModel.self) private var model
    @State private var code = ""
    @State private var backup = ""
    @State private var useBackup = false
    @State private var backupCodes = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section("Enter your code") {
                Text("Open your authenticator app and type the 6-digit code for this account.")
                if useBackup {
                    Text("Type one of your backup codes. This turns two-step sign-in off so you can sign in and set it up again.")
                    TextField("Backup code", text: $backup)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                } else {
                    TextField("6-digit code", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                }
            }
            if let error { Text(error).foregroundStyle(Color.danger) }
            if useBackup {
                Button("Use this code") { Task { await run { try await model.store.useBackupCode(backup) } } }
                    .disabled(busy || !BackupCode.looksComplete(backup))
                Button("Use my authenticator app instead") {
                    useBackup = false
                    error = nil
                }
            } else {
                Button("Continue") { Task { await run { try await model.store.enterCode(code) } } }
                    .disabled(busy || code.trimmingCharacters(in: .whitespaces).count != 6)
                if backupCodes {
                    Button("Lost your phone? Use a backup code") {
                        useBackup = true
                        error = nil
                    }
                }
            }
            Button("Sign out", role: .destructive) {
                Task {
                    await model.store.signOut()
                    model.state = .signedOut
                }
            }
        }
        .task { backupCodes = (try? await model.store.api.signupConfig().backupCodes) ?? false }
    }

    private func run(_ step: () async throws -> SignInState) async {
        busy = true
        defer { busy = false }
        do {
            model.state = try await step()
            error = nil
        } catch {
            code = ""
            self.error = error.localizedDescription
        }
    }
}
