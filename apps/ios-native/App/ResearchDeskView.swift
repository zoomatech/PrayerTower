import PrayerTowerKit
import SwiftUI

/// The research desk beside Search the texts (Steve, 5 November 2026: "the infopanels for the build news and scholar
/// social feeds should appear to the right of the bible search"), as the Ehrmanator Research Desk: news panels with a
/// live news search, scholar feeds with a search link for each account, and the McClellan topical index. Its own
/// column on a wide screen; on a phone its sections follow the search's in the same list.
struct ResearchDeskView: View {
    var body: some View {
        List { ResearchDeskSections() }
    }
}

/// The desk's sections, for a list of their own or the end of another.
struct ResearchDeskSections: View {
    enum Panel: Hashable { case news, scholars, index }
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var panel = Panel.news
    @State private var newsFilter = "all"
    @State private var newsWords = ""
    @State private var newsWhen = "30d"
    @State private var scholarWords = ""
    @State private var searchedScholars = ""
    @State private var indexWords = ""
    @State private var indexTopic: String?
    @State private var byNumber = false
    private let desk = ResearchDesk.bundled
    private var w: Words { model.words }

    var body: some View {
        if let desk {
            Section {
                Picker(w("desk.title"), selection: $panel) {
                    Text(w("desk.news")).tag(Panel.news)
                    Text(w("desk.scholars")).tag(Panel.scholars)
                    Text(w("desk.index")).tag(Panel.index)
                }
                .pickerStyle(.segmented)
            } header: { Text(w("desk.title")) }
            switch panel {
            case .news: news(desk.news)
            case .scholars: scholars(desk)
            case .index: index(desk.index)
            }
        }
    }

    // MARK: News panels

    @ViewBuilder private func news(_ news: ResearchDesk.News) -> some View {
        Section {
            TextField(w("desk.newsPlaceholder"), text: $newsWords)
                .submitLabel(.search)
                .onSubmit { searchNews() }
                .accessibilityLabel(w("desk.liveSearch"))
            Picker(w("desk.liveSearch"), selection: $newsWhen) {
                Text(w("desk.weekPast")).tag("7d")
                Text(w("desk.monthPast")).tag("30d")
                Text(w("desk.yearPast")).tag("1y")
                Text(w("desk.anyTime")).tag("")
            }
            Button(w("desk.googleNews")) { searchNews() }
            if let bing = ResearchDesk.bingNews(words) { Link(w("desk.bingNews") + " ↗", destination: bing) }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(news.presets, id: \.self) { preset in
                        if let url = ResearchDesk.newsSearch(preset, when: newsWhen) {
                            Link(preset, destination: url).buttonStyle(.bordered).font(.footnote)
                        }
                    }
                }
            }
        } header: { Text(w("desk.liveSearch")) } footer: { Text(news.researched) }
        Section {
            Picker(w("desk.filter"), selection: $newsFilter) {
                ForEach(news.filters) { f in Text("\(f.title) (\(news.items(f.id).count))").tag(f.id) }
            }
            ForEach(news.items(newsFilter)) { item in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(news.sides[item.side] ?? item.side).font(.caption.bold()).foregroundStyle(Color.subtle)
                        Spacer()
                        Text(item.date).font(.caption.monospaced()).foregroundStyle(Color.subtle)
                    }
                    Text(item.title).font(.headline)
                    Text(item.body)
                    ForEach(item.points, id: \.self) { Text("• " + $0).font(.callout) }
                    ForEach(item.sources, id: \.url) { source in
                        if let url = URL(string: source.url) { Link(source.label + " ↗", destination: url).font(.footnote) }
                    }
                }
                .padding(.vertical, 4)
                // Each link its own tap, not the whole row's.
                .buttonStyle(.borderless)
            }
        } header: { Text(w("desk.news")) }
    }

    /// What the live search looks for: the words typed, or the desk's first preset.
    private var words: String {
        let typed = newsWords.trimmingCharacters(in: .whitespaces)
        return typed.isEmpty ? (desk?.news.presets.first ?? "") : typed
    }

    private func searchNews() {
        if let url = ResearchDesk.newsSearch(words, when: newsWhen) { openURL(url) }
    }

    // MARK: Scholar feeds

    @ViewBuilder private func scholars(_ desk: ResearchDesk) -> some View {
        Section {
            Text(w("desk.scholarsIntro")).font(.footnote).foregroundStyle(Color.subtle)
            TextField(w("desk.scholarsPlaceholder"), text: $scholarWords)
                .submitLabel(.search)
                .onSubmit { searchedScholars = scholarWords.trimmingCharacters(in: .whitespaces) }
                .accessibilityLabel(w("desk.scholars"))
            Button(w("desk.searchAll")) { searchedScholars = scholarWords.trimmingCharacters(in: .whitespaces) }
        } footer: { Text(w("desk.signIn")) }
        ForEach(desk.scholars) { scholar in
            Section {
                Text(scholar.role).font(.footnote).foregroundStyle(Color.subtle)
                ForEach(scholar.accounts) { account in
                    if let url = URL(string: account.url) {
                        LabeledContent(account.platform) { Link(account.handle, destination: url) }
                    }
                }
                Text(scholar.note).font(.footnote).foregroundStyle(Color.subtle)
                Text(searchedScholars.isEmpty ? w("desk.searchAll") : w("desk.searchFor", ["words": searchedScholars])).font(.caption.bold())
                ForEach(scholar.search) { search in
                    if search.searchesIndex {
                        Button(search.label) {
                            indexWords = searchedScholars
                            indexTopic = nil
                            panel = .index
                        }
                    } else if let url = search.address(searchedScholars) {
                        Link(search.label + " ↗", destination: url)
                    }
                }
            } header: { Text(scholar.name) }
        }
        Section {
            Text(w("desk.outletsIntro")).font(.footnote).foregroundStyle(Color.subtle)
            ForEach(desk.outlets) { outlet in
                if let url = URL(string: outlet.url) {
                    VStack(alignment: .leading, spacing: 2) {
                        Link(outlet.name + " ↗", destination: url).font(.body.bold())
                        Text(outlet.about).font(.footnote).foregroundStyle(Color.subtle)
                    }
                }
            }
        } header: { Text(w("desk.outlets")) }
    }

    // MARK: McClellan index

    @ViewBuilder private func index(_ index: ResearchDesk.Index) -> some View {
        let found = index.episodes(matching: indexWords, topic: indexTopic)
        Section {
            Text(index.title).font(.footnote).foregroundStyle(Color.subtle)
            TextField(w("desk.indexPlaceholder"), text: $indexWords).accessibilityLabel(w("desk.index"))
            Picker(w("desk.allTopics"), selection: $indexTopic) {
                Text("\(w("desk.allTopics")) (\(index.episodes.count))").tag(String?.none)
                ForEach(index.topicOrder, id: \.self) { t in
                    Text("\(index.topics[t]!) (\(index.episodes(matching: "", topic: t).count))").tag(String?.some(t))
                }
            }
            Picker("", selection: $byNumber) {
                Text(w("desk.byTopic")).tag(false)
                Text(w("desk.byNumber")).tag(true)
            }
            .pickerStyle(.segmented)
        } footer: { Text(w("desk.count", ["shown": "\(found.count)", "total": "\(index.episodes.count)"])) }
        if found.isEmpty {
            Section { Text(w("desk.noEpisodes", ["words": indexWords])) }
        } else if byNumber {
            Section { ForEach(found) { episode($0, index) } }
        } else {
            ForEach((indexTopic.map { [$0] } ?? index.topicOrder), id: \.self) { topic in
                let here = found.filter { $0.topics.contains(topic) }
                if !here.isEmpty {
                    Section {
                        ForEach(here) { episode($0, index) }
                    } header: { Text("\(index.topics[topic]!) (\(here.count))") }
                }
            }
        }
    }

    private func episode(_ e: ResearchDesk.Episode, _ index: ResearchDesk.Index) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(e.number)").font(.callout.monospacedDigit().bold())
                Text(e.title)
            }
            Text(([e.date] + e.topics.compactMap { index.topics[$0] }).joined(separator: " · ")).font(.caption).foregroundStyle(Color.subtle)
            HStack(spacing: 16) {
                if let url = e.youTube { Link(w("desk.youTube") + " ↗", destination: url) }
                if let url = e.applePodcasts { Link(w("desk.apple") + " ↗", destination: url) }
            }
            .font(.footnote)
        }
        .buttonStyle(.borderless)
    }
}
