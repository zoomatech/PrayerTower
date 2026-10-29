import PrayerTowerKit
import SwiftUI

// Surveys (the feed's prompt and the member's form), and the admin's surveys, legal requests,
// CSV import and podcasts, as the Expo app's survey-prompts, survey/[id], surveys, legal,
// import and podcasts-admin screens.

/// Runs a call and shows its error.
@MainActor private func run(_ failure: Binding<String?>, _ call: () async throws -> Void) async {
    do {
        try await call()
        failure.wrappedValue = nil
    } catch {
        failure.wrappedValue = error.localizedDescription
    }
}

private func day(_ iso: String?) -> String {
    guard let iso else { return "" }
    let d = (try? Date(iso, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(iso, strategy: .iso8601))
    return d?.formatted(date: .abbreviated, time: .omitted) ?? iso
}

// MARK: - Surveys for members

/// Open surveys the member hasn't answered, at the top of the feed. Shows nothing offline.
struct SurveyPrompts: View {
    @Environment(AppModel.self) private var model
    @State private var items: [Survey] = []
    private var w: Words { model.words }

    var body: some View {
        ForEach(items) { s in
            VStack(alignment: .leading, spacing: 6) {
                Text(w("surveys.prompt", ["title": s.title])).font(.headline)
                if let intro = s.intro { Text(intro) }
                NavigationLink(w("surveys.take")) { SurveyView(survey: s) }
            }
        }
        .task { items = (try? await model.store.api.surveys()) ?? [] }
    }
}

struct SurveyView: View {
    @Environment(AppModel.self) private var model
    let survey: Survey
    @State private var drafts: [String: SurveyDraft] = [:]
    @State private var busy = false
    @State private var sent = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            if sent {
                Text(w("surveys.thanks"))
            } else {
                Section {
                    if let intro = survey.intro { Text(intro) }
                    Text(w(survey.anonymous ? "surveys.anonymous" : "surveys.named")).font(.footnote)
                }
                ForEach(survey.questions) { q in
                    Section {
                        question(q)
                    } header: {
                        Text(q.prompt)
                    } footer: {
                        if q.required { Text(w("surveys.required")) }
                    }
                }
                if let error { Text(error).foregroundStyle(.red) }
                Button(w("surveys.send")) { Task { await send() } }
                    .disabled(busy || !SurveyAnswer.ready(survey, drafts))
            }
        }
        .navigationTitle(survey.title)
    }

    @ViewBuilder private func question(_ q: SurveyQuestion) -> some View {
        let d = drafts[q.id] ?? SurveyDraft()
        switch q.kind {
        case "single", "multi":
            Text(w(q.kind == "single" ? "surveys.pickOne" : "surveys.pickAny")).font(.caption)
            ForEach(q.options, id: \.self) { o in
                Button {
                    drafts[q.id, default: SurveyDraft()].tap(o, single: q.kind == "single")
                } label: {
                    Label(o, systemImage: d.choices.contains(o) ? (q.kind == "single" ? "largecircle.fill.circle" : "checkmark.square.fill") : (q.kind == "single" ? "circle" : "square"))
                }
                .accessibilityAddTraits(d.choices.contains(o) ? .isSelected : [])
            }
        case "scale":
            if q.options.count == 2 { Text("1 = \(q.options[0]) · 5 = \(q.options[1])").font(.caption) }
            ChoiceRow(options: ["1", "2", "3", "4", "5"], selected: d.value.map(String.init), label: { $0 }) { v in
                let n = Int(v)
                drafts[q.id, default: SurveyDraft()].value = d.value == n ? nil : n
            }
        default:
            TextField(w("surveys.textPlaceholder"), text: Binding(get: { d.text }, set: { drafts[q.id, default: SurveyDraft()].text = $0 }), axis: .vertical)
                .lineLimit(3...10)
                .accessibilityLabel(q.prompt)
        }
    }

    private func send() async {
        busy = true
        defer { busy = false }
        await run($error) {
            _ = try await model.store.api.answerSurvey(survey.id, SurveyAnswer.from(survey, drafts))
            sent = true
        }
    }
}

// MARK: - Admin: surveys

struct SurveysAdminView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [Survey] = []
    @State private var title = ""
    @State private var intro = ""
    @State private var community = ""
    @State private var anonymous = true
    @State private var questions = [QuestionDraft()]
    @State private var results: SurveyResults?
    @State private var busy = false
    @State private var notice: String?
    @State private var error: String?
    private var w: Words { model.words }
    private var draft: NewSurvey? { NewSurvey(title: title, intro: intro, anonymous: anonymous, community: community, questions: questions) }

    var body: some View {
        Form {
            Section { Text(w("surveysAdmin.intro")) }
            if let notice { Text(notice) }
            if let error { Text(error).foregroundStyle(.red) }
            Section(w("surveysAdmin.list")) {
                if items.isEmpty { Text(w("surveysAdmin.empty")).foregroundStyle(.secondary) }
                ForEach(items) { s in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(listLine(s)).font(.caption)
                        Text(s.title).bold()
                        HStack {
                            if s.status != "open" {
                                Button(w("surveysAdmin.open", ["title": s.title])) { act { _ = try await model.store.api.setSurveyStatus(s.id, "open") } }
                            } else {
                                Button(w("surveysAdmin.close", ["title": s.title])) { act { _ = try await model.store.api.setSurveyStatus(s.id, "closed") } }
                            }
                            if results?.survey.id == s.id {
                                Button(w("surveysAdmin.hide")) { results = nil }
                            } else {
                                Button(w("surveysAdmin.results", ["title": s.title])) { act { results = try await model.store.api.surveyResults(s.id) } }
                            }
                            if (s.responses ?? 0) == 0 {
                                Button(w("surveysAdmin.remove", ["title": s.title]), role: .destructive) { act { _ = try await model.store.api.deleteSurvey(s.id) } }
                            }
                        }
                        .buttonStyle(.borderless)
                        .disabled(busy)
                        if let results, results.survey.id == s.id { resultsView(results) }
                    }
                }
            }
            Section(w("surveysAdmin.new")) {
                TextField(w("surveysAdmin.surveyTitle"), text: $title)
                TextField(w("surveysAdmin.surveyIntro"), text: $intro, axis: .vertical)
                TextField(w("surveysAdmin.community"), text: $community).textInputAutocapitalization(.never)
                Toggle(isOn: $anonymous) { LabelHint(w("surveysAdmin.anonymous"), w("surveysAdmin.anonymousHint")) }
            }
            ForEach($questions) { $q in
                let n = (questions.firstIndex { $0.id == q.id } ?? 0) + 1
                Section(w("surveysAdmin.question", ["n": String(n)])) {
                    ChoiceRow(options: QuestionDraft.kinds, selected: q.kind, label: { w("surveysAdmin.kind.\($0)") }) { q.kind = $0 }
                    TextField(w("surveysAdmin.prompt"), text: $q.prompt)
                    if q.kind != "text" {
                        TextField(w(q.kind == "scale" ? "surveysAdmin.scaleEnds" : "surveysAdmin.options"), text: $q.options, axis: .vertical).lineLimit(2...8)
                    }
                    Toggle(w("surveysAdmin.mustAnswer"), isOn: $q.required)
                    if questions.count > 1 {
                        let id = q.id
                        Button(w("surveysAdmin.removeQuestion", ["n": String(n)]), role: .destructive) { questions.removeAll { $0.id == id } }
                    }
                }
            }
            Section {
                if questions.count < 30 { Button(w("surveysAdmin.addQuestion")) { questions.append(QuestionDraft()) } }
                Button(w("surveysAdmin.create")) { create() }.disabled(busy || draft == nil)
            }
        }
        .navigationTitle(w("surveysAdmin.title"))
        .task { await load() }
    }

    private func listLine(_ s: Survey) -> String {
        var line = "\(w("surveysAdmin.status.\(s.status)")) · \(w("surveysAdmin.responses", count: s.responses ?? 0))"
        if let c = s.community { line += " · \(c)" }
        return line
    }

    @ViewBuilder private func resultsView(_ r: SurveyResults) -> some View {
        if !r.shown {
            Text(w("surveysAdmin.tooFew")).font(.caption)
        } else {
            ForEach(r.questions) { q in
                VStack(alignment: .leading, spacing: 2) {
                    Text(q.prompt).bold()
                    ForEach((q.counts ?? [:]).sorted { $0.key < $1.key }, id: \.key) { k, n in Text("\(k): \(n)").font(.caption) }
                    if let a = q.average { Text(w("surveysAdmin.average", ["value": String(format: "%.1f", a)])).font(.caption) }
                    if let texts = q.texts {
                        if texts.isEmpty { Text(w("surveysAdmin.noTexts")).font(.caption) }
                        ForEach(Array(texts.enumerated()), id: \.offset) { Text("“\($0.element)”").font(.caption) }
                    }
                }
            }
        }
    }

    private func load() async { await run($error) { items = try await model.store.api.adminSurveys() } }

    private func act(_ call: @escaping () async throws -> Void) {
        Task {
            busy = true
            defer { busy = false }
            notice = nil
            await run($error, call)
            await load()
        }
    }

    private func create() {
        guard let draft else { return }
        act {
            _ = try await model.store.api.createSurvey(draft)
            notice = w("surveysAdmin.created")
            title = ""
            intro = ""
            community = ""
            anonymous = true
            questions = [QuestionDraft()]
        }
    }
}

// MARK: - Admin: legal requests

struct LegalCasesView: View {
    @Environment(AppModel.self) private var model
    @State private var enabled: Bool?
    @State private var cases: [LegalCase] = []
    @State private var open: LegalCaseDetail?
    @State private var kind = "preservation"
    @State private var agency = ""
    @State private var reference = ""
    @State private var subject = ""
    @State private var summary = ""
    @State private var note = ""
    @State private var exported: ExportFile?
    @State private var busy = false
    @State private var notice: String?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            Section { Text(w("legalCases.intro")) }
            if let notice { Text(notice) }
            if let error { Text(error).foregroundStyle(.red) }
            if let enabled {
                Toggle(isOn: Binding(get: { enabled }, set: { on in act(nil) { _ = try await model.store.api.setLegalEnabled(on); await model.loadSettings() } })) {
                    LabelHint(w("legalCases.enabled"), w("legalCases.enabledHint"))
                }
            }
            if enabled == true {
                Section(w("legalCases.new")) {
                    ChoiceRow(options: LegalCase.kinds, selected: kind, label: { w("legalCases.kind.\($0)") }) { kind = $0 }
                    TextField(w("legalCases.agency"), text: $agency)
                    TextField(w("legalCases.reference"), text: $reference)
                    TextField(w("legalCases.subject"), text: $subject).textInputAutocapitalization(.never)
                    TextField(w("legalCases.summary"), text: $summary, axis: .vertical).lineLimit(3...10)
                    Button(w("legalCases.create")) {
                        act(w("legalCases.created")) {
                            open = try await model.store.api.createLegalCase(kind: kind, agency: agency, reference: reference, subject: subject, summary: summary)
                            agency = ""; reference = ""; subject = ""; summary = ""
                        }
                    }
                    .disabled(busy || summary.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            Section(w("legalCases.cases")) {
                if cases.isEmpty { Text(w("legalCases.empty")).foregroundStyle(.secondary) }
                ForEach(cases) { c in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(caseLine(c)).font(.caption)
                        Text([c.agency, c.reference].compactMap { $0 }.joined(separator: " · ").nonEmpty ?? w("legalCases.noAgency")).bold()
                        Text(c.summary)
                        if let n = c.subjectName { Text(w("legalCases.about", ["name": n])).font(.caption) }
                        if let open, open.case.id == c.id {
                            detail(open)
                        } else {
                            Button(w("legalCases.open", ["title": c.reference ?? c.kind])) { act(nil) { open = try await model.store.api.legalCase(c.id) } }
                                .buttonStyle(.borderless)
                        }
                    }
                }
            }
        }
        .navigationTitle(w("legalCases.title"))
        .task { await load() }
        .sheet(item: $exported) { file in ShareLink(item: file.url) { Label(w("legalCases.export"), systemImage: "square.and.arrow.up") }.padding() }
    }

    private func caseLine(_ c: LegalCase) -> String {
        var s = "\(w("legalCases.kind.\(c.kind)")) · \(w("legalCases.status.\(c.status)")) · \(day(c.createdAt))"
        if c.activeHolds > 0 { s += " · " + w("legalCases.holding", count: c.activeHolds) }
        return s
    }

    @ViewBuilder private func detail(_ d: LegalCaseDetail) -> some View {
        let isOpen = d.case.status == "open"
        Text(w("legalCases.holds")).font(.headline)
        if d.holds.isEmpty { Text(w("legalCases.noHolds")).font(.caption) }
        ForEach(d.holds) { h in
            if let released = h.releasedAt {
                Text(w("legalCases.holdReleased", ["date": day(released)])).font(.caption)
            } else {
                Text(w("legalCases.holdActive", ["date": day(h.expiresAt)], count: h.items)).font(.caption)
                HStack {
                    Button(w("legalCases.export")) { export(h.id) }
                    Button(w("legalCases.refresh")) { act(w("legalCases.refreshed")) { open = try await model.store.api.refreshHold(h.id) } }
                    Button(w("legalCases.release"), role: .destructive) { act(w("legalCases.released")) { open = try await model.store.api.releaseHold(h.id) } }
                }
                .buttonStyle(.borderless)
            }
        }
        if isOpen && d.case.subjectId != nil {
            Button(w("legalCases.placeHold")) { act(w("legalCases.held")) { open = try await model.store.api.placeHold(d.case.id) } }
                .buttonStyle(.borderless).disabled(busy)
        }
        Text(w("legalCases.notes")).font(.headline)
        ForEach(d.notes) { n in Text("\(day(n.createdAt)) · \(n.author ?? "—"): \(n.body)").font(.caption) }
        TextField(w("legalCases.addNote"), text: $note, axis: .vertical)
        HStack {
            Button(w("legalCases.saveNote")) {
                act(nil) {
                    open = try await model.store.api.addLegalNote(d.case.id, note)
                    note = ""
                }
            }
            .disabled(busy || note.trimmingCharacters(in: .whitespaces).isEmpty)
            if isOpen { Button(w("legalCases.close"), role: .destructive) { act(w("legalCases.closedNotice")) { open = try await model.store.api.closeLegalCase(d.case.id) } } }
            Button(w("legalCases.hide")) { open = nil }
        }
        .buttonStyle(.borderless)
    }

    private func load() async {
        await run($error) {
            enabled = try await model.store.api.legalEnabled()
            cases = try await model.store.api.legalCases()
        }
    }

    private func act(_ done: String?, _ call: @escaping () async throws -> Void) {
        Task {
            busy = true
            defer { busy = false }
            notice = nil
            await run($error, call)
            if error == nil { notice = done }
            await load()
        }
    }

    private func export(_ id: String) {
        act(nil) {
            let data = try await model.store.api.exportHold(id)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("evidence-hold-\(id).json")
            try data.write(to: url, options: .completeFileProtection)
            exported = ExportFile(url: url)
        }
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}

// MARK: - Admin: CSV import

/// Members become single-use invite codes; requests are posted by this admin. Preview first.
struct ImportView: View {
    @Environment(AppModel.self) private var model
    @State private var kind = "members"
    @State private var csv = ""
    @State private var note = ""
    @State private var sendEmails = false
    @State private var result: ImportResult?
    @State private var busy = false
    @State private var error: String?
    private var w: Words { model.words }
    private var previewed: Bool { result?.dryRun == true && result?.error == nil && result?.kind == kind }
    private var ready: Int { previewed ? result?.count("ok") ?? 0 : 0 }

    var body: some View {
        Form {
            Section {
                Text(w("import.intro"))
                ChoiceRow(options: ["members", "requests"], selected: kind, label: { w("import.\($0)") }) { kind = $0; result = nil }
                Text(w(kind == "members" ? "import.membersHint" : "import.requestsHint")).font(.footnote)
            }
            Section(w("import.paste")) {
                TextField(kind == "members" ? "email,name" : "request,anonymous", text: Binding(get: { csv }, set: { csv = $0; result = nil }), axis: .vertical)
                    .lineLimit(6...20)
                    .font(.body.monospaced())
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            if kind == "members" {
                Section {
                    TextField(w("import.note"), text: $note, prompt: Text(w("import.notePlaceholder")))
                    Toggle(isOn: $sendEmails) { LabelHint(w("import.sendEmails"), w("import.sendEmailsHint")) }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
            Section {
                Button(w("import.preview")) { Task { await go(dryRun: true) } }.disabled(busy || csv.trimmingCharacters(in: .whitespaces).isEmpty)
                Button(w("import.run", count: ready)) { Task { await go(dryRun: false) } }.disabled(busy || !previewed || ready == 0)
            }
            if let result, result.error == nil {
                Section {
                    Text(summary(result)).bold()
                    ForEach(result.rows) { r in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(w("import.line", ["line": String(r.line)])) · \(w("import.status.\(r.status)"))\(r.code.map { " · \($0)" } ?? "")").font(.caption)
                            Text(r.email.map { "\(r.name.map { "\($0) " } ?? "")<\($0)>" } ?? r.request ?? "").textSelection(.enabled)
                            if let reason = r.reason { Text(reason).font(.caption).foregroundStyle(r.status == "error" ? Color.red : Color.secondary) }
                        }
                    }
                }
            }
        }
        .navigationTitle(w("import.title"))
    }

    private func summary(_ r: ImportResult) -> String {
        if r.dryRun {
            return w("import.previewSummary", ["ok": String(r.count("ok")), "skipped": String(r.count("skipped")), "errors": String(r.count("error"))])
        }
        let done = r.count("invited") + r.count("emailed") + r.count("posted")
        return w("import.doneSummary", ["done": String(done), "skipped": String(r.count("skipped")), "errors": String(r.count("error"))])
    }

    private func go(dryRun: Bool) async {
        busy = true
        defer { busy = false }
        await run($error) {
            let r = try await model.store.api.importCsv(kind: kind, csv: csv, dryRun: dryRun, note: note, sendEmails: sendEmails)
            result = r
            if let e = r.error { error = e }
        }
    }
}

// MARK: - Admin: podcasts

struct PodcastsAdminView: View {
    @Environment(AppModel.self) private var model
    @State private var enabled = true
    @State private var shows: [PodcastShow] = []
    @State private var slug = ""
    @State private var title = ""
    @State private var about = ""
    @State private var author = ""
    @State private var image = ""
    @State private var community = ""
    @State private var busy = false
    @State private var error: String?
    private var w: Words { model.words }
    private var validShow: Bool {
        let i = image.trimmingCharacters(in: .whitespaces)
        return Podcasts.validSlug(slug) && ![title, about, author].contains { $0.trimmingCharacters(in: .whitespaces).isEmpty } && (i.isEmpty || i.hasPrefix("https://"))
    }

    var body: some View {
        Form {
            Section { Text(w("podcastsAdmin.intro")) }
            if !enabled { Text(w("podcastsAdmin.off")).foregroundStyle(.orange) }
            if let error { Text(error).foregroundStyle(.red) }
            if shows.isEmpty { Text(w("podcastsAdmin.empty")).foregroundStyle(.secondary) }
            ForEach(shows) { s in
                ShowAdminSection(show: s, busy: busy) { call in act(call) }
            }
            Section(w("podcastsAdmin.newShow")) {
                TextField(w("podcastsAdmin.slug"), text: Binding(get: { slug }, set: { slug = $0.lowercased() })).textInputAutocapitalization(.never)
                TextField(w("podcastsAdmin.showTitle"), text: $title)
                TextField(w("podcastsAdmin.description"), text: $about, axis: .vertical)
                TextField(w("podcastsAdmin.author"), text: $author)
                TextField(w("podcastsAdmin.image"), text: $image).keyboardType(.URL).textInputAutocapitalization(.never)
                TextField(w("podcastsAdmin.community"), text: $community).textInputAutocapitalization(.never)
                Button(w("podcastsAdmin.createShow")) {
                    act {
                        _ = try await model.store.api.createPodcast(slug: slug, title: title, description: about, author: author, imageUrl: image, community: community)
                        slug = ""; title = ""; about = ""; author = ""; image = ""; community = ""
                    }
                }
                .disabled(busy || !validShow)
            }
        }
        .navigationTitle(w("podcastsAdmin.title"))
        .task { await load() }
    }

    private func load() async {
        await run($error) {
            let r = try await model.store.api.adminPodcasts()
            enabled = r.enabled
            shows = r.shows
        }
    }

    private func act(_ call: @escaping () async throws -> Void) {
        Task {
            busy = true
            defer { busy = false }
            await run($error, call)
            await load()
        }
    }
}

struct ShowAdminSection: View {
    @Environment(AppModel.self) private var model
    let show: PodcastShow
    let busy: Bool
    let act: (@escaping () async throws -> Void) -> Void
    @State private var title = ""
    @State private var audio = ""
    @State private var mins = ""
    private var w: Words { model.words }
    private var minutes: Int? { Int(mins.trimmingCharacters(in: .whitespaces)) }
    private var valid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && audio.trimmingCharacters(in: .whitespaces).hasPrefix("https://")
            && (mins.trimmingCharacters(in: .whitespaces).isEmpty || (minutes ?? 0) > 0)
    }

    var body: some View {
        Section {
            Text([w(show.published == true ? "podcastsAdmin.published" : "podcastsAdmin.draft"), show.community, show.category].compactMap { $0 }.joined(separator: " · ")).font(.caption)
            Text(show.title).bold()
            if let slug = show.slug {
                Text(w("podcastsAdmin.feed", ["url": model.store.api.baseURL.appendingPathComponent("podcasts/\(slug)/feed.xml").absoluteString]))
                    .font(.caption).textSelection(.enabled)
            }
            Button(w(show.published == true ? "podcastsAdmin.unpublish" : "podcastsAdmin.publish", ["title": show.title])) {
                act { _ = try await model.store.api.setPodcastPublished(show.id, !(show.published ?? false)) }
            }
            .disabled(busy)
            ForEach(show.episodes) { e in
                VStack(alignment: .leading) {
                    Text(e.title + (e.publishedAt == nil ? " · " + w("podcastsAdmin.episodeDraft") : ""))
                    HStack {
                        Button(w(e.publishedAt != nil ? "podcastsAdmin.unpublish" : "podcastsAdmin.publish", ["title": e.title])) {
                            act { _ = try await model.store.api.setEpisodePublished(e.id, e.publishedAt == nil) }
                        }
                        Button(w("podcastsAdmin.remove", ["title": e.title]), role: .destructive) { act { _ = try await model.store.api.removeEpisode(e.id) } }
                    }
                    .buttonStyle(.borderless)
                }
            }
            Text(w("podcastsAdmin.newEpisode")).font(.headline)
            TextField(w("podcastsAdmin.episodeTitle"), text: $title)
            TextField(w("podcastsAdmin.audio"), text: $audio).keyboardType(.URL).textInputAutocapitalization(.never)
            TextField(w("podcastsAdmin.minutes"), text: $mins).keyboardType(.numberPad)
            HStack {
                Button(w("podcastsAdmin.addEpisode")) { add(publish: true) }
                Button(w("podcastsAdmin.addDraft")) { add(publish: false) }
            }
            .buttonStyle(.borderless)
            .disabled(busy || !valid)
        }
    }

    private func add(publish: Bool) {
        let t = title, a = audio, m = minutes
        act {
            _ = try await model.store.api.addEpisode(show: show.id, title: t, audioUrl: a, minutes: m, publish: publish)
            title = ""; audio = ""; mins = ""
        }
    }
}
