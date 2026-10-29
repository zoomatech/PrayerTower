import PrayerTowerKit
import SwiftUI

/// Parallels: related passages from different texts side by side, as the Expo app's parallels.tsx.
struct ParallelsView: View {
    @Environment(AppModel.self) private var model
    @State private var list: ParallelThemes?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let list {
                if !list.enabled {
                    Text(w("library.parallelsOff"))
                } else {
                    Section { Text(w("library.parallelsIntro")) }
                    if list.themes.isEmpty { Text(w("library.parallelsNone")) }
                    ForEach(list.themes) { t in
                        NavigationLink { ParallelThemeView(id: t.id) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(t.title).font(.headline)
                                Text(t.intro)
                                Text(t.texts.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            } else if error == nil {
                ProgressView()
            }
        }
        .navigationTitle(w("library.parallels"))
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            list = try await model.store.api.parallels()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One theme: a sideways row of cards on iPhone, columns where there is room.
struct ParallelThemeView: View {
    @Environment(AppModel.self) private var model
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var width
    private var wide: Bool { width == .regular }
    #else
    private let wide = true
    #endif
    let id: String
    @State private var theme: ParallelTheme?
    @State private var error: String?
    @State private var sharing: SharedPassage?
    private var w: Words { model.words }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let error { Text(error).foregroundStyle(.red) }
                if let theme {
                    Text(theme.intro)
                    Text(w("library.parallelsCount", count: theme.sides.count)).font(.caption).foregroundStyle(.secondary)
                    if wide {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), alignment: .top)], spacing: 12) { cards(theme) }
                    } else {
                        ScrollView(.horizontal) {
                            LazyHStack(alignment: .top, spacing: 12) { cards(theme).frame(width: 300) }
                        }
                    }
                } else if error == nil {
                    ProgressView()
                }
            }
            .padding()
        }
        .navigationTitle(theme?.title ?? w("library.parallels"))
        .task { await load() }
        .sheet(item: $sharing) { ComposeView(start: $0.post) }
    }

    @ViewBuilder private func cards(_ theme: ParallelTheme) -> some View {
        ForEach(Array(theme.sides.enumerated()), id: \.offset) { _, s in
            VStack(alignment: .leading, spacing: 6) {
                Text(s.excerpt.collectionTitle).font(.caption).foregroundStyle(.secondary)
                if let label = s.label { Text(label).font(.headline) }
                Text(s.excerpt.text).textSelection(.enabled)
                Text(s.excerpt.citation).font(.caption).foregroundStyle(.secondary)
                if model.features["libraryShare"] {
                    Button(w("library.share")) { sharing = SharedPassage(post: Library.shared(s.excerpt.text, citation: s.excerpt.citation)) }
                        .accessibilityLabel(w("library.shareOne", ["citation": s.excerpt.citation]))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color.softBackground, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func load() async {
        do {
            theme = try await model.store.api.parallel(id)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Reading plans from the library, as the Expo app's reading-plans.tsx: own pace, alone or with a circle.
struct ReadingPlansView: View {
    @Environment(AppModel.self) private var model
    @State private var plans: ReadingPlans?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let plans {
                if !plans.enabled {
                    Text(w("library.plansOff"))
                } else {
                    Section { Text(w("library.plansIntro")) }
                    ForEach(plans.plans) { p in Section { plan(p, circles: plans.circles) } }
                }
            } else if error == nil {
                ProgressView()
            }
        }
        .navigationTitle(w("library.plans"))
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private func plan(_ p: ReadingPlan, circles: [PlanProgress.Circle]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(p.title).font(.headline)
            Text(p.intro)
            Text(w("library.planDays", count: p.days)).font(.caption).foregroundStyle(.secondary)
            ForEach(p.circles) { c in
                Text(w("library.planCircleReading", ["circle": c.name], count: c.readers)).font(.caption).foregroundStyle(.secondary)
            }
        }
        if let f = p.following {
            Text(f.finished ? w("library.planFinished") : w("library.planProgress", ["read": String(f.read), "days": String(p.days)]))
            if let next = f.next {
                NavigationLink(w("library.planOpenDay", ["day": String(next)])) { PlanDayView(plan: p.id, day: next) }
            }
            Toggle(isOn: Binding(get: { f.reminders }, set: { v in act { try await model.store.api.followPlan(p.id, reminders: v) } })) {
                VStack(alignment: .leading) {
                    Text(w("library.planReminders"))
                    Text(w("library.planRemindersHint")).font(.caption).foregroundStyle(.secondary)
                }
            }
            Button(w("library.planStop"), role: .destructive) { act { try await model.store.api.unfollowPlan(p.id) } }
        } else {
            Button(w("library.planFollow")) { act { try await model.store.api.followPlan(p.id) } }
            ForEach(circles, id: \.id) { c in
                Button(w("library.planFollowWith", ["circle": c.name])) { act { try await model.store.api.followPlan(p.id, circleId: c.id) } }
            }
        }
    }

    private func act(_ call: @escaping () async throws -> ReadingPlans) {
        Task {
            do {
                plans = try await call()
                error = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func load() async {
        do {
            plans = try await model.store.api.readingPlans()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One day of a plan: the reading, its citation, and I read it.
struct PlanDayView: View {
    @Environment(AppModel.self) private var model
    let plan: String
    @State var day: Int
    @State private var data: ReadingPlanDay?
    @State private var error: String?
    @State private var sharing: SharedPassage?
    private var w: Words { model.words }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let error { Text(error).foregroundStyle(.red) }
                if let data {
                    Text(w("library.planDayOf", ["day": String(data.day), "days": String(data.plan.days)])).font(.caption).foregroundStyle(.secondary)
                    Text(data.reading.citation).font(.headline)
                    Text(data.reading.text).textSelection(.enabled)
                    if let c = data.circle {
                        Text(w("library.planCircleToday", ["circle": c.name, "readers": String(c.readers), "reading": String(c.reading)])).font(.caption).foregroundStyle(.secondary)
                    }
                    if data.following != nil {
                        if data.read {
                            Label(w("library.planRead"), systemImage: "checkmark.circle.fill")
                        } else {
                            Button(w("library.planMarkRead")) { Task { await markRead() } }.buttonStyle(.borderedProminent)
                        }
                    }
                    if model.features["libraryShare"] {
                        Button(w("library.share")) { sharing = SharedPassage(post: Library.shared(String(data.reading.text.prefix(1500)), citation: data.reading.citation)) }
                            .accessibilityLabel(w("library.shareOne", ["citation": data.reading.citation]))
                    }
                    HStack {
                        if data.day > 1 { Button(w("library.planPrevious")) { day -= 1 }.buttonStyle(.bordered) }
                        if data.day < data.plan.days { Button(w("library.planNext")) { day += 1 }.buttonStyle(.bordered) }
                    }
                } else if error == nil {
                    ProgressView()
                }
            }
            .padding()
        }
        .navigationTitle(data?.plan.title ?? w("library.plans"))
        .task(id: day) { await load() }
        .sheet(item: $sharing) { ComposeView(start: $0.post) }
    }

    private func load() async {
        do {
            data = try await model.store.api.planDay(plan, day: day)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func markRead() async {
        do {
            data = try await model.store.api.readPlanDay(plan, day: day)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
