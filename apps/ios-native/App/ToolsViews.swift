import PrayerTowerKit
import SwiftUI

// Prayer tools from Me, as the Expo app's prayer-list, prayer-minute, prayer-chain, prayer-cast,
// pools, give, why-gifts and macro-needs screens, and Power Prayer on a request.

private func dateTime(_ iso: String) -> String {
    let d = (try? Date(iso, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(iso, strategy: .iso8601))
    return d?.formatted(date: .abbreviated, time: .shortened) ?? iso
}

/// Runs a call and shows its error.
@MainActor private func run(_ failure: Binding<String?>, _ call: () async throws -> Void) async {
    do {
        try await call()
        failure.wrappedValue = nil
    } catch {
        failure.wrappedValue = error.localizedDescription
    }
}

/// The tool links on Me, each shown while its switch is on.
struct ToolsSection: View {
    @Environment(AppModel.self) private var model
    @State private var giving: GivingInfo?
    private var w: Words { model.words }

    var body: some View {
        let f = model.features
        let shows = { (feature: String) in model.me?.community?.shows(feature) ?? true }
        Section {
            if f["prayerList"] { NavigationLink(w("prayerList.title")) { PrayerListView() } }
            if f["prayerMinute"] { NavigationLink(w("growth.minuteOpen")) { PrayerMinuteView() } }
            if f["prayerChain"] { NavigationLink(w("growth.chainOpen")) { PrayerChainView() } }
            if shows("pools") { NavigationLink(w("profile.pools")) { PoolsView() } }
            if giving?.enabled == true { NavigationLink(w("give.open")) { GiveView() } }
            if f["whyGifts"] { NavigationLink(w("whyGifts.link")) { WhyGiftsView() } }
            if shows("radio") { NavigationLink(w("profile.prayerCast")) { PrayerCastView() } }
            if Staff.isModerator(model.me?.roles ?? []) { NavigationLink(w("profile.macroNeeds")) { MacroNeedsView() } }
        }
        .task { giving = try? await model.store.api.givingInfo() }
    }
}

// MARK: - Prayer list

struct PrayerListView: View {
    @Environment(AppModel.self) private var model
    @State private var list: PrayerList?
    @State private var name = ""
    @State private var note = ""
    @State private var remind = "off"
    @State private var hour = "9"
    @State private var busy = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            Section { Text(w("prayerList.intro")) }
            if list?.enabled == false {
                Text(w("prayerList.closed"))
            } else {
                Section {
                    TextField(w("prayerList.name"), text: $name, prompt: Text(w("prayerList.namePlaceholder")))
                    TextField(w("prayerList.note"), text: $note, axis: .vertical)
                    Picker(w("prayerList.remind"), selection: $remind) {
                        ForEach(PrayerList.reminders, id: \.self) { Text(w("prayerList.\($0)")).tag($0) }
                    }
                    if remind != "off" { TextField(w("prayerList.hour"), text: $hour).keyboardType(.numberPad) }
                    Button(w("prayerList.add")) { Task { await add() } }
                        .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Section {
                    let items = list?.items ?? []
                    if items.isEmpty { Text(w("prayerList.empty")).foregroundStyle(.secondary) }
                    ForEach(items) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.name).font(.headline)
                            if !item.note.isEmpty { Text(item.note) }
                            Text(w("prayerList.prayedCount", count: item.prayedCount)).font(.caption).foregroundStyle(.secondary)
                            HStack {
                                Button(w("prayerList.prayed")) { Task { await change { try await model.store.api.prayedForListItem(item.id) } } }
                                Spacer()
                                Button(w("prayerList.remove"), role: .destructive) { Task { await change { try await model.store.api.removePrayerListItem(item.id) } } }
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("prayerList.title"))
        .task { await change { try await model.store.api.prayerList() } }
    }

    private func change(_ call: () async throws -> PrayerList) async {
        busy = true
        defer { busy = false }
        await run($error) { list = try await call() }
    }

    private func add() async {
        let item = NewPrayerListItem(name: name, note: note, remind: remind, hour: hour)
        await change { try await model.store.api.addToPrayerList(item) }
        if error == nil { name = ""; note = "" }
    }
}

// MARK: - Prayer minute

struct PrayerMinuteView: View {
    @Environment(AppModel.self) private var model
    @State private var minute: PrayerMinute?
    @State private var now: PrayerMinuteNow?
    @State private var time = ""
    @State private var saved: String?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            Section { Text(w("growth.minuteIntro")) }
            if let now, now.enabled {
                Section {
                    let n = now.together ?? 0
                    Text(n > 1 ? w("growth.minuteTogether", count: n) : w("growth.minuteTogetherOne")).font(.headline)
                }
                Section(w("growth.minuteRequests")) {
                    let cards = now.requests ?? []
                    if cards.isEmpty { Text(w("growth.minuteNoRequests")).foregroundStyle(.secondary) }
                    ForEach(cards) { c in
                        NavigationLink { PostDetailView(postId: c.id) } label: { Text(c.preview.isEmpty ? c.body : c.preview).lineLimit(4) }
                    }
                }
            }
            Section {
                if let t = minute?.time {
                    Text(w("growth.minuteSaved", ["time": t, "zone": minute?.timeZone ?? ""]))
                    if let o = minute?.others, o > 0 { Text(w("growth.minuteOthers", count: o)).foregroundStyle(.secondary) }
                } else {
                    Text(w("growth.minuteNone")).foregroundStyle(.secondary)
                }
                TextField(w("growth.minuteTime"), text: $time).keyboardType(.numbersAndPunctuation)
                Button(w("growth.minuteSave")) {
                    Task { await run($error) { minute = try await model.store.api.setPrayerMinute(time) } }
                }
                .disabled(!PrayerMinute.valid(time))
                if minute?.time != nil {
                    Button(w("growth.minuteClear"), role: .destructive) {
                        Task { await run($error) { _ = try await model.store.api.clearPrayerMinute(); minute = try await model.store.api.prayerMinute() } }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("growth.minuteTitle"))
        .task {
            await run($error) {
                minute = try await model.store.api.prayerMinute()
                time = minute?.time ?? ""
            }
            // While the screen is open, say so every 30 seconds, as the Expo screen does.
            while !Task.isCancelled {
                now = try? await model.store.api.prayerMinuteNow()
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }
}

// MARK: - Prayer chain

struct PrayerChainView: View {
    @Environment(AppModel.self) private var model
    @State private var people: [ChainPerson] = []
    @State private var email = ""
    @State private var phone = ""
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            Section { Text(w("growth.chainIntro")) }
            Section {
                TextField(w("growth.chainEmail"), text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                Button(w("growth.chainAdd")) { Task { await add { try await model.store.api.addToPrayerChain(email: email) }; email = "" } }
                    .disabled(!email.contains("@"))
            }
            if model.features["prayerChainSms"] {
                Section {
                    TextField(w("growth.chainPhone"), text: $phone).keyboardType(.phonePad)
                    Button(w("growth.chainAddPhone")) { Task { await add { try await model.store.api.addToPrayerChain(phone: phone) }; phone = "" } }
                        .disabled(phone.filter(\.isNumber).count < 7)
                } footer: { Text(w("growth.chainPhoneHint")) }
            }
            Section {
                if people.isEmpty { Text(w("growth.chainEmpty")).foregroundStyle(.secondary) }
                ForEach(people) { p in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(p.email ?? p.phone ?? "")
                            Text(w("growth.chainStatus.\(p.status)")).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button(w("growth.chainRemove"), role: .destructive) { Task { await add { try await model.store.api.removeFromPrayerChain(p.id) } } }
                            .buttonStyle(.borderless)
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("growth.chainTitle"))
        .task { await run($error) { people = try await model.store.api.prayerChain() } }
    }

    private func add(_ call: () async throws -> Ignored) async {
        await run($error) {
            _ = try await call()
            people = try await model.store.api.prayerChain()
        }
    }
}

// MARK: - Prayer Cast

/// Prayers that went out by radio. Read-only; sending stays with the radio screens.
struct PrayerCastView: View {
    @Environment(AppModel.self) private var model
    @State private var cast: PrayerCast?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("cast.intro")) }
            if let cast {
                Section {
                    LabeledContent(w("cast.sent"), value: String(cast.totals.prayers))
                    LabeledContent(w("cast.transmissions"), value: String(cast.totals.sends))
                }
                Section {
                    if cast.cast.isEmpty { Text(w("cast.empty")).foregroundStyle(.secondary) }
                    ForEach(cast.cast) { c in
                        NavigationLink { PostDetailView(postId: c.post_id) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(c.text).lineLimit(4)
                                Text(line(c)).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("profile.prayerCast"))
        .task { await run($error) { cast = try await model.store.api.prayerCast() } }
        .refreshable { await run($error) { cast = try await model.store.api.prayerCast() } }
    }

    private func line(_ c: PrayerCast.Sent) -> String {
        var s = dateTime(c.transmitted_at)
        if c.repeats > 1 { s += " · " + w("cast.amplified", count: c.repeats) }
        if let call = c.call_sign { s += " · \(call)" } else if c.transmitter == "log" { s += " · " + w("cast.testLog") }
        return s
    }
}

// MARK: - Power Prayer

/// On someone's request (or the member's own): ask more people who don't know the asker to pray.
struct PowerPrayerSection: View {
    @Environment(AppModel.self) private var model
    let card: Card
    @State private var status: PowerPrayerStatus?
    @State private var balance = 0
    @State private var sent: Int?
    @State private var busy = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Group {
            if let sent {
                Text(sent == 0 ? w("post.powerNone") : w(card.isMine ? "post.powerSentYou" : "post.powerSentThem", count: sent))
            } else if let status, let reason = status.blockedReason, !card.isMine {
                Text(w("post.powerBlocked", ["reason": reason])).font(.footnote).foregroundStyle(.secondary)
            } else if let status, status.blockedReason == nil, status.cost == 0 || balance >= status.cost {
                Button(status.cost == 0 ? w("post.powerFree", count: status.reach) : w("post.powerCost", ["cost": String(status.cost)], count: status.reach)) {
                    Task { await send() }
                }
                .disabled(busy)
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .task {
            status = try? await model.store.api.powerPrayerStatus()
            balance = (try? await model.store.api.tokens())?.balance ?? 0
        }
    }

    private func send() async {
        busy = true
        defer { busy = false }
        await run($error) {
            let r = try await model.store.api.powerPrayer(card.id)
            sent = r.powerPrayer.reached
            status = r.next
        }
    }
}

// MARK: - Token pools

struct PoolsView: View {
    @Environment(AppModel.self) private var model
    @State private var open: [TokenPool] = []
    @State private var mine: [TokenPool] = []
    @State private var ledger: PoolLedger?
    @State private var balance = 0
    @State private var amounts: [String: String] = [:]
    @State private var starting = false
    @State private var notice: String?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("pools.intro")); Text(w("pools.howToUse")).font(.footnote) }
            Section { Text(w("pools.youHave", count: balance)) }
            if let notice { Section { Text(notice) } }
            Section(w("pools.open")) {
                let others = open.filter { $0.isMine != true }
                if others.isEmpty { Text(w("pools.noneOpen")).foregroundStyle(.secondary) }
                ForEach(others) { p in
                    VStack(alignment: .leading, spacing: 6) {
                        PoolSummary(pool: p)
                        HStack {
                            TextField(w("pools.addTokens"), text: Binding(get: { amounts[p.id] ?? "" }, set: { amounts[p.id] = $0 }))
                                .keyboardType(.numberPad)
                            Button(w("pools.give")) { Task { await fund(p) } }
                                .disabled((Staff.whole(amounts[p.id] ?? "") ?? 0) <= 0)
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
            Section(w("pools.yours")) {
                if mine.isEmpty { Text(w("pools.noneMine")).foregroundStyle(.secondary) }
                ForEach(mine) { p in
                    VStack(alignment: .leading, spacing: 6) {
                        PoolSummary(pool: p)
                        if p.open != false {
                            Button(w("pools.close"), role: .destructive) { Task { await change { _ = try await model.store.api.closeTokenPool(p.id) } } }
                                .buttonStyle(.borderless)
                        }
                    }
                }
                Button(w("pools.start")) { starting = true }
            }
            if let ledger, ledger.enabled {
                Section(w("pools.ledgerTitle")) {
                    Text(w("pools.ledgerGiven", ["givers": String(ledger.givers ?? 0)], count: ledger.given ?? 0))
                    if let m = ledger.matched, m > 0 { Text(w("pools.ledgerMatched", count: m)) }
                    Text(w("pools.ledgerReached", ["requests": String(ledger.requestsHelped ?? 0), "recent": String(ledger.reachedLast30Days ?? 0)], count: ledger.reachedRequests ?? 0))
                    if let r = ledger.returned, r > 0 { Text(w("pools.ledgerReturned", count: r)) }
                }
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
        }
        .navigationTitle(w("profile.pools"))
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $starting) { NewPoolSheet { Task { await load() } } }
    }

    private func load() async {
        await run($error) {
            open = try await model.store.api.openTokenPools()
            mine = try await model.store.api.myTokenPools()
            balance = try await model.store.api.tokens().balance
            if model.features["poolLedger"] { ledger = try? await model.store.api.poolLedger() }
        }
    }

    private func change(_ call: () async throws -> Void) async {
        await run($error) { try await call() }
        await load()
    }

    private func fund(_ p: TokenPool) async {
        guard let n = Staff.whole(amounts[p.id] ?? ""), n > 0 else { return }
        await run($error) {
            let r = try await model.store.api.fundTokenPool(p.id, amount: n)
            balance = r.balance
            amounts[p.id] = nil
            notice = w("pools.gave", ["matched": String(r.matched)])
        }
        await load()
    }
}

struct PoolSummary: View {
    @Environment(AppModel.self) private var model
    let pool: TokenPool
    private var w: Words { model.words }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(pool.open == false ? w("pools.closed", ["name": pool.name]) : pool.name).font(.headline)
            if let purpose = pool.purpose, !purpose.isEmpty { Text(purpose) }
            if let donor = pool.donor { Text(w("pools.from", ["name": donor])).font(.caption) }
            if let realm = pool.realm { Text(w("pools.only", ["realm": w("enums.prayerRealm.\(realm)")])).font(.caption) }
            Text(w("pools.left", ["per": String(pool.drawAmount)], count: pool.balance)).font(.caption).foregroundStyle(.secondary)
            if let m = pool.match {
                let vars = ["ratio": String(m.ratio), "matched": String(m.matched), "cap": String(m.cap)]
                Text(w(m.mode == "quadratic" ? "pools.matchingMany" : "pools.matching", vars)).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct NewPoolSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var onMade: () -> Void
    @State private var name = ""
    @State private var purpose = ""
    @State private var realm: String?
    @State private var amount = ""
    @State private var draw = "1"
    @State private var showDonor = false
    @State private var manyHands = false
    @State private var ratio = "0"
    @State private var cap = ""
    @State private var error: String?
    private var w: Words { model.words }
    private var matching: Bool { model.features["poolMatching"] }
    private var pool: NewPool? {
        NewPool(name: name, purpose: purpose, realm: realm, amount: amount, draw: draw, showDonor: showDonor, matching: matching, manyHands: manyHands, ratio: ratio, cap: cap)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(w("pools.name"), text: $name, prompt: Text(w("pools.namePlaceholder")))
                    TextField(w("pools.purpose"), text: $purpose, axis: .vertical)
                    TextField(w("pools.amount"), text: $amount).keyboardType(.numberPad)
                    TextField(w("pools.drawAmount"), text: $draw).keyboardType(.numberPad)
                    Toggle(w("pools.showName"), isOn: $showDonor)
                }
                Section(w("pools.onlyFor")) {
                    ChoiceRow(options: Compose.realms, selected: realm, label: { w("enums.prayerRealm.\($0)") }) { realm = realm == $0 ? nil : $0 }
                }
                if matching {
                    Section {
                        Toggle(isOn: $manyHands) { LabelHint(w("pools.manyHands"), w("pools.manyHandsHint")) }
                        if !manyHands { TextField(w("pools.matchRatio"), text: $ratio).keyboardType(.numberPad) }
                        TextField(w("pools.matchCap"), text: $cap).keyboardType(.numberPad)
                    } footer: { Text(w("pools.shareBack")) }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle(w("pools.start"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(w("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(w("pools.create")) {
                        guard let pool else { return }
                        Task {
                            await run($error) { _ = try await model.store.api.createTokenPool(pool) }
                            if error == nil { onMade(); dismiss() }
                        }
                    }
                    .disabled(pool == nil)
                }
            }
        }
    }
}

// MARK: - Giving

/// Give money by card (Stripe or Zeffy checkout) or PayPal, to everyone, one member, or a pool,
/// and see past gifts. The radio-allowance section stays with the radio screens.
struct GiveView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    /// Set when opened from a member's request.
    var member: (id: String, name: String)?
    @State private var info: GivingInfo?
    @State private var gifts: [MyGift] = []
    @State private var pools: [TokenPool] = []
    @State private var target: Giving.Target = .everyone
    @State private var cents = 1000
    @State private var other = ""
    @State private var showDonor = false
    @State private var busy = false
    @State private var notice: String?
    @State private var error: String?
    private var w: Words { model.words }
    private var amount: Int? { other.isEmpty ? cents : Giving.cents(other) }

    var body: some View {
        Form {
            Section { Text(w("give.intro")) }
            if let info, !info.enabled {
                Text(w("give.off"))
            } else if let info {
                Section(w("give.to")) {
                    Picker(w("give.to"), selection: $target) {
                        Text(w("give.everyone")).tag(Giving.Target.everyone)
                        if let member { Text(member.name.isEmpty ? w("give.member") : member.name).tag(Giving.Target.member(member.id)) }
                        ForEach(pools) { Text($0.name).tag(Giving.Target.pool($0.id)) }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
                Section(w("give.amount")) {
                    ChoiceRow(options: Giving.amounts.map(String.init), selected: other.isEmpty ? String(cents) : nil, label: { Giving.dollars(Int($0) ?? 0) }) {
                        cents = Int($0) ?? cents
                        other = ""
                    }
                    TextField(w("give.other"), text: $other).keyboardType(.decimalPad)
                    Toggle(w("give.showName"), isOn: $showDonor)
                }
                Section {
                    if info.provider != "none" {
                        Button(w("give.giveAmount", ["amount": Giving.dollars(amount ?? 0)])) { Task { await give() } }
                            .disabled(busy || !fits(info))
                    }
                    if let paypal = info.paypalUrl, let url = URL(string: paypal) {
                        Button(w("give.paypal")) { openURL(url) }
                    }
                } footer: { Text(w("give.fees")) }
            }
            if let notice { Text(notice) }
            if let error { Text(error).foregroundStyle(.red) }
            if !gifts.isEmpty {
                Section(w("give.history")) {
                    ForEach(gifts) { g in
                        LabeledContent(Giving.dollars(g.amount_cents), value: "\(w("give.status.\(g.status)")) · \(dateTime(g.created_at))")
                    }
                }
            }
        }
        .navigationTitle(w("give.title"))
        .task {
            if let member { target = .member(member.id) }
            await run($error) {
                info = try await model.store.api.givingInfo()
                gifts = try await model.store.api.myGifts()
                if model.me?.community?.shows("pools") ?? true { pools = (try? await model.store.api.openTokenPools()) ?? [] }
            }
        }
    }

    private func fits(_ info: GivingInfo) -> Bool {
        guard let amount else { return false }
        return amount >= info.minCents && amount <= info.maxCents
    }

    private func give() async {
        guard let amount else { return }
        busy = true
        defer { busy = false }
        await run($error) {
            if let url = try await model.store.api.giveCheckout(cents: amount, to: target, showDonor: showDonor) {
                openURL(url)
                notice = w("give.thanks")
            }
        }
    }
}

struct WhyGiftsView: View {
    @Environment(AppModel.self) private var model
    @State private var why: WhyGifts?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let why {
                Section { Text(why.intro) }
                ForEach(why.points, id: \.heading) { p in
                    Section(p.heading) { Text(p.body) }
                }
                Section {
                    NavigationLink(w("whyGifts.give")) { GiveView() }
                    if let path = why.fundPath, let url = URL(string: path, relativeTo: model.store.api.baseURL) {
                        Link(w("whyGifts.report"), destination: url)
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(why?.title ?? w("whyGifts.link"))
        .task { await run($error) { why = try await model.store.api.whyGifts(model.wording) } }
    }
}

// MARK: - Macro needs (staff)

struct MacroNeedsView: View {
    struct Partner { var label = ""; var url = "" }
    @Environment(AppModel.self) private var model
    @State private var needs: [MacroNeed] = []
    @State private var title = ""
    @State private var text = ""
    @State private var partners = Array(repeating: Partner(), count: 3)
    @State private var notice: String?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            Section { Text(w("macroAdmin.intro")) }
            Section(w("macroAdmin.featured")) {
                if needs.isEmpty { Text(w("macroAdmin.none")).foregroundStyle(.secondary) }
                ForEach(needs) { n in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(n.title).font(.headline)
                        Text(w("macroAdmin.stats", ["prayers": String(n.prayers), "tokens": String(n.tokens), "helpers": String(n.helpers)])).font(.caption)
                        Button(w("macroAdmin.stop"), role: .destructive) {
                            Task { await run($error) { _ = try await model.store.api.endMacroNeed(n.id) }; await load() }
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
            Section {
                TextField(w("macroAdmin.title"), text: $title, prompt: Text(w("macroAdmin.titlePlaceholder")))
                TextField(w("macroAdmin.body"), text: $text, axis: .vertical).lineLimit(3...8)
            }
            Section(w("macroAdmin.partners")) {
                ForEach(partners.indices, id: \.self) { i in
                    TextField(w("macroAdmin.partnerName"), text: $partners[i].label)
                    TextField("https://", text: $partners[i].url).keyboardType(.URL).textInputAutocapitalization(.never)
                }
            }
            Section {
                Button(w("macroAdmin.feature")) { Task { await feature() } }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || text.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if let notice { Text(notice) }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("profile.macroNeeds"))
        .task { await load() }
    }

    private func load() async { await run($error) { needs = try await model.store.api.macroNeeds() } }

    private func feature() async {
        await run($error) {
            _ = try await model.store.api.createMacroNeed(title: title, body: text, options: partners.map { ($0.label, $0.url) })
            notice = w("macroAdmin.saved")
            title = ""
            text = ""
            partners = Array(repeating: Partner(), count: 3)
        }
        await load()
    }
}
