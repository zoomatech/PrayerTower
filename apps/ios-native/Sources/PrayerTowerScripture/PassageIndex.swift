#if canImport(Accelerate)
import Accelerate
#endif
import Foundation

// Ported from Winstons Syndicate (Packages/ZoomaBibleSearch/Sources/ZoomaBiblePassages/PassageIndex.swift). The same
// files, 16-bit floats and scores; Accelerate on Apple platforms, a plain loop where it is missing (Linux, for tests).

/// One translation's groups with a vector for each, made once at setup and kept on the device.
public struct PassageIndex: Sendable {
    public let translation: BibleTranslation
    public let groups: [PassageGroup]
    public let dimensions: Int
    /// Unit-length vectors, one after another, `dimensions` numbers each, in the groups' order, as 16-bit floats
    /// (their bits, so that the type is the same on every Mac).
    let vectors: [UInt16]

    public init(translation: BibleTranslation, groups: [PassageGroup], vectors: [[Float]]) {
        precondition(groups.count == vectors.count && !vectors.isEmpty)
        self.translation = translation
        self.groups = groups
        dimensions = vectors[0].count
        let whole = vectors.flatMap(PassageIndex.unit)
        self.vectors = Self.halves(whole)
    }

    static func halves(_ whole: [Float]) -> [UInt16] {
        #if canImport(Accelerate)
        var halves = [UInt16](repeating: 0, count: whole.count)
        whole.withUnsafeBufferPointer { from in
            halves.withUnsafeMutableBufferPointer { to in
                var source = vImage_Buffer(data: UnsafeMutableRawPointer(mutating: from.baseAddress!), height: 1,
                                           width: vImagePixelCount(whole.count), rowBytes: whole.count * 4)
                var target = vImage_Buffer(data: to.baseAddress!, height: 1, width: vImagePixelCount(whole.count), rowBytes: whole.count * 2)
                _ = vImageConvert_PlanarFtoPlanar16F(&source, &target, vImage_Flags(kvImageNoFlags))
            }
        }
        return halves
        #else
        return whole.map { Float16($0).bitPattern }
        #endif
    }

    init(translation: BibleTranslation, groups: [PassageGroup], dimensions: Int, vectors: [UInt16]) {
        self.translation = translation
        self.groups = groups
        self.dimensions = dimensions
        self.vectors = vectors
    }

    /// The vector made unit length, so that a dot product is the cosine similarity.
    public static func unit(_ vector: [Float]) -> [Float] {
        let length = sqrt(vector.reduce(0) { $0 + $1 * $1 })
        return length > 0 ? vector.map { $0 / length } : vector
    }

    // MARK: Kept on the device

    struct Contents: Codable {
        let model: String
        let translation: BibleTranslation
        let dimensions: Int
        let groups: [PassageGroup]
    }

    static func files(_ translation: BibleTranslation, in folder: URL) -> (groups: URL, vectors: URL) {
        (folder.appendingPathComponent("\(translation.rawValue).groups.json"), folder.appendingPathComponent("\(translation.rawValue).vectors"))
    }

    /// Writes the groups, then the vectors; an index is whole only when both are there and agree.
    public func save(in folder: URL, model: String) throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let (groupsFile, vectorsFile) = Self.files(translation, in: folder)
        try JSONEncoder().encode(Contents(model: model, translation: translation, dimensions: dimensions, groups: groups))
            .write(to: groupsFile, options: .atomic)
        try vectors.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: vectorsFile, options: .atomic)
    }

    /// The translation's index in the folder, if it is whole and was made by the model named.
    public static func load(_ translation: BibleTranslation, from folder: URL, model: String) -> PassageIndex? {
        let (groupsFile, vectorsFile) = files(translation, in: folder)
        guard let data = try? Data(contentsOf: groupsFile),
              let contents = try? JSONDecoder().decode(Contents.self, from: data),
              contents.model == model, contents.translation == translation, contents.dimensions > 0,
              let raw = try? Data(contentsOf: vectorsFile),
              raw.count == contents.groups.count * contents.dimensions * MemoryLayout<UInt16>.size else { return nil }
        let vectors = raw.withUnsafeBytes { Array($0.bindMemory(to: UInt16.self)) }
        return PassageIndex(translation: translation, groups: contents.groups, dimensions: contents.dimensions, vectors: vectors)
    }

    // MARK: Search

    /// The cosine similarity of each group to the unit-length query, in the groups' order.
    func scores(_ query: [Float]) -> [Float] {
        precondition(query.count == dimensions)
        #if !canImport(Accelerate)
        return groups.indices.map { row in
            (0..<dimensions).reduce(Float(0)) { $0 + Float(Float16(bitPattern: vectors[row * dimensions + $1])) * query[$1] }
        }
        #else
        var scores = [Float](repeating: 0, count: groups.count)
        let rowsAtATime = 2048
        var block = [Float](repeating: 0, count: rowsAtATime * dimensions)
        vectors.withUnsafeBufferPointer { all in
            var row = 0
            while row < groups.count {
                let rows = min(rowsAtATime, groups.count - row)
                let count = rows * dimensions
                block.withUnsafeMutableBufferPointer { out in
                    var source = vImage_Buffer(data: UnsafeMutableRawPointer(mutating: all.baseAddress! + row * dimensions),
                                               height: 1, width: vImagePixelCount(count), rowBytes: count * 2)
                    var target = vImage_Buffer(data: out.baseAddress!, height: 1, width: vImagePixelCount(count), rowBytes: count * 4)
                    _ = vImageConvert_Planar16FtoPlanarF(&source, &target, vImage_Flags(kvImageNoFlags))
                }
                scores.withUnsafeMutableBufferPointer { result in
                    vDSP_mmul(block, 1, query, 1, result.baseAddress! + row, 1, vDSP_Length(rows), 1, vDSP_Length(dimensions))
                }
                row += rows
            }
        }
        return scores
        #endif
    }
}

/// A group found for a phrase: its reference, the translation whose words came nearest, and how near.
public struct PassageMatch: Equatable, Sendable {
    public let group: PassageGroup
    public let translation: BibleTranslation
    public let score: Float
    public var reference: String { group.reference }
}

public enum PassageSearch {
    /// The groups nearest the query by cosine similarity, merged across translations by reference with the best
    /// score kept (owner, 28 October 2026: "Merge results across translations by reference, keeping the best score.
    /// Return the top 5 with references and text").
    public static func nearest(_ query: [Float], in indexes: [PassageIndex], count: Int = 5) -> [PassageMatch] {
        let unit = PassageIndex.unit(query)
        var best: [String: PassageMatch] = [:]
        for index in indexes where index.dimensions == unit.count {
            for (i, score) in index.scores(unit).enumerated() {
                let group = index.groups[i]
                if let held = best[group.reference], held.score >= score { continue }
                best[group.reference] = PassageMatch(group: group, translation: index.translation, score: score)
            }
        }
        return Array(best.values.sorted { $0.score != $1.score ? $0.score > $1.score : $0.reference < $1.reference }.prefix(count))
    }

    /// The groups the owner's cascade text search ranks highest (his test, run_cascade.py, 29 October 2026), merged
    /// across translations by reference with the best kept, ties in the Bible's order; a group in no tier is never
    /// given.
    public static func cascade(_ question: String, in indexes: [(PassageIndex, CascadeIndex)], count: Int = 5) -> [PassageMatch] {
        var best: [String: (match: PassageMatch, order: Int)] = [:]
        for (index, cascade) in indexes {
            for (i, score) in cascade.scores(question).enumerated() where score > 0 && i < index.groups.count {
                let group = index.groups[i]
                if let held = best[group.reference], held.match.score >= score { continue }
                best[group.reference] = (PassageMatch(group: group, translation: index.translation, score: score), i)
            }
        }
        return Array(best.values.sorted { $0.match.score != $1.match.score ? $0.match.score > $1.match.score : $0.order < $1.order }
            .prefix(count).map(\.match))
    }

    /// The owner's hybrid (his test, run_hybrid_cascade.py, 29 October 2026: 67 of 77, the best he measured): in each
    /// translation, 0.7 × the groups' cosine similarity plus 0.3 × their cascade score (`CascadeIndex`), each scaled
    /// from 0 to 1 over that translation's groups; merged across translations by reference with the best kept, ties
    /// in the Bible's order.
    public static func blended(_ query: [Float], _ question: String, in indexes: [(PassageIndex, CascadeIndex)],
                               meaning: Float = 0.7, count: Int = 5) -> [PassageMatch] {
        let unit = PassageIndex.unit(query)
        var best: [String: (match: PassageMatch, order: Int)] = [:]
        for (index, cascade) in indexes where index.dimensions == unit.count {
            let near = CascadeIndex.minMax(index.scores(unit))
            let words = CascadeIndex.minMax(cascade.scores(question))
            for i in index.groups.indices {
                let score = meaning * near[i] + (1 - meaning) * words[i]
                let group = index.groups[i]
                if let held = best[group.reference], held.match.score >= score { continue }
                best[group.reference] = (PassageMatch(group: group, translation: index.translation, score: score), i)
            }
        }
        return Array(best.values.sorted { $0.match.score != $1.match.score ? $0.match.score > $1.match.score : $0.order < $1.order }
            .prefix(count).map(\.match))
    }
}
