import PrayerTowerSession
import SwiftUI

struct SignInView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

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
        }
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
}

/// The second step of signing in: the 6-digit code from the authenticator app.
struct CodeView: View {
    @Environment(AppModel.self) private var model
    @State private var code = ""
    @State private var error: String?

    var body: some View {
        Form {
            Section("Enter your code") {
                Text("Open your authenticator app and type the 6-digit code for this account.")
                TextField("6-digit code", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
            }
            if let error { Text(error).foregroundStyle(.red) }
            Button("Continue") {
                Task {
                    do { model.state = try await model.store.enterCode(code) } catch { self.error = error.localizedDescription }
                }
            }
            .disabled(code.count != 6)
            Button("Sign out", role: .destructive) {
                Task {
                    await model.store.signOut()
                    model.state = .signedOut
                }
            }
        }
    }
}
