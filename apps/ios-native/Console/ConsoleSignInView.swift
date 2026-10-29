import PrayerTowerKit
import PrayerTowerSession
import SwiftUI

/// Email and password, as the iPhone app. The console is for admins and radio operators; the
/// server checks the role on every call.
struct ConsoleSignInView: View {
    @Environment(ConsoleModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                TextField("Email", text: $email).textContentType(.username)
                SecureField("Password", text: $password).textContentType(.password)
                    .onSubmit { Task { await signIn() } }
            } header: {
                Text(model.words("operatorConsole.title")).font(.title.bold())
            }
            if let error { Text(error).foregroundStyle(.red) }
            Button(busy ? "Signing in…" : "Sign in") { Task { await signIn() } }
                .keyboardShortcut(.defaultAction)
                .disabled(busy || !email.contains("@") || password.count < 6)
        }
        .formStyle(.grouped)
        .frame(maxWidth: 420)
        .padding()
    }

    private func signIn() async {
        busy = true
        defer { busy = false }
        do {
            model.state = try await model.store.signIn(email: email, password: password)
            model.signedInChanged()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The authenticator code when two-step sign-in is on.
struct ConsoleCodeView: View {
    @Environment(ConsoleModel.self) private var model
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section("Enter your code") {
                Text("Open your authenticator app and type the 6-digit code for this account.")
                TextField("6-digit code", text: $code).textContentType(.oneTimeCode)
                    .onSubmit { Task { await enter() } }
            }
            if let error { Text(error).foregroundStyle(.red) }
            Button("Continue") { Task { await enter() } }
                .keyboardShortcut(.defaultAction)
                .disabled(busy || code.trimmingCharacters(in: .whitespaces).count != 6)
            Button(model.words("macConsole.signOut"), role: .destructive) { Task { await model.signOut() } }
        }
        .formStyle(.grouped)
        .frame(maxWidth: 420)
        .padding()
    }

    private func enter() async {
        busy = true
        defer { busy = false }
        do {
            model.state = try await model.store.enterCode(code)
            model.signedInChanged()
            error = nil
        } catch {
            code = ""
            self.error = error.localizedDescription
        }
    }
}
