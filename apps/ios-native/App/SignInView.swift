import PrayerTowerKit
import PrayerTowerSession
import SwiftUI
import UIKit

/// The window the system passkey sheet is shown from.
@MainActor
func presentationWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow)
}

struct SignInView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    /// Passkeys and backup codes follow Admin → Sign-in security (public sign-in settings).
    @State private var config = SignupConfig()

    var body: some View {
        Form {
            Section {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                SecureField("Password", text: $password)
                    .textContentType(.password)
            } header: {
                Text("Prayer Tower").font(.largeTitle.bold()).textCase(nil)
            }
            if let error { Text(error).foregroundStyle(.red) }
            Button(busy ? "Signing in…" : "Sign in") {
                Task { await signIn() }
            }
            .disabled(busy || !email.contains("@") || password.count < 6)
            if config.passkeys {
                Button {
                    Task { await passkey() }
                } label: {
                    Label("Use a passkey", systemImage: "person.badge.key")
                }
                .disabled(busy)
            }
        }
        .task { config = (try? await model.store.api.signupConfig()) ?? SignupConfig() }
    }

    private func signIn() async {
        busy = true
        defer { busy = false }
        do {
            model.state = try await model.store.signIn(email: email, password: password)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func passkey() async {
        guard let window = presentationWindow() else { return }
        busy = true
        defer { busy = false }
        do {
            model.state = try await model.store.signInWithPasskey(from: window)
            error = nil
        } catch {
            self.error = error.localizedDescription
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
            if let error { Text(error).foregroundStyle(.red) }
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
