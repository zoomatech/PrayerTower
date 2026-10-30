import Foundation
import OnnxRuntimeBindings
import PrayerTowerScripture
import Tokenizers

// Ported unchanged from Winstons Syndicate (Packages/ZoomaBibleSearch/Sources/ZoomaBibleSearch/OnnxEmbedder.swift).
// It lives in the app, not in PrayerTowerScripture, because ONNX Runtime does not build on Linux where the package is tested.

/// An embedding model run on the device by ONNX Runtime, from the folder its files were downloaded to. Its tokenizer is
/// read from the model's own tokenizer.json. Nothing is sent anywhere.
final class OnnxEmbedder: PassageEmbedder, @unchecked Sendable {
    let model: EmbeddingModel
    private let tokenizer: any Tokenizer
    private let env: ORTEnv
    private let session: ORTSession
    private let inputNames: Set<String>
    private let outputNames: [String]
    /// The longest text taken, in tokens, as in the owner's test (run_chunking.py: max_len=2048).
    static let longest = 2048

    init(model: EmbeddingModel, folder: URL) async throws {
        self.model = model
        tokenizer = try await AutoTokenizer.from(modelFolder: folder)
        env = try ORTEnv(loggingLevel: .warning)
        let options = try ORTSessionOptions()
        try options.setGraphOptimizationLevel(.all)
        session = try ORTSession(env: env, modelPath: folder.appending(path: model.onnx).path, sessionOptions: options)
        inputNames = Set(try session.inputNames())
        outputNames = try session.outputNames()
    }

    /// The phrase searched for, exactly as typed, after the model's query prompt.
    func query(_ phrase: String) throws -> [Float] {
        try embed([model.queryPrompt + phrase])[0]
    }

    /// Each group's text after the model's document prompt.
    func documents(_ texts: [String]) throws -> [[Float]] {
        try embed(texts.map { model.documentPrompt + $0 })
    }

    /// One vector for each text, in one batch: the model's sentence embedding, or the mean of its last layer over the
    /// text's tokens where it gives none.
    private func embed(_ texts: [String]) throws -> [[Float]] {
        let ids = texts.map { Array(tokenizer.encode(text: $0).prefix(Self.longest)) }
        let width = ids.map(\.count).max() ?? 0
        guard width > 0 else { return texts.map { _ in [] } }
        var tokens = [Int64](repeating: 0, count: ids.count * width)
        var mask = [Int64](repeating: 0, count: ids.count * width)
        for (row, text) in ids.enumerated() {
            for (column, id) in text.enumerated() {
                tokens[row * width + column] = Int64(id)
                mask[row * width + column] = 1
            }
        }
        let shape: [NSNumber] = [NSNumber(value: ids.count), NSNumber(value: width)]
        func tensor(_ values: [Int64]) throws -> ORTValue {
            try ORTValue(tensorData: values.withUnsafeBufferPointer { NSMutableData(data: Data(buffer: $0)) },
                         elementType: .int64, shape: shape)
        }
        var inputs: [String: ORTValue] = [:]
        if inputNames.contains("input_ids") { inputs["input_ids"] = try tensor(tokens) }
        if inputNames.contains("attention_mask") { inputs["attention_mask"] = try tensor(mask) }
        if inputNames.contains("token_type_ids") { inputs["token_type_ids"] = try tensor([Int64](repeating: 0, count: tokens.count)) }
        let pooled = outputNames.contains("sentence_embedding")
        let name = pooled ? "sentence_embedding" : outputNames[0]
        guard let output = try session.run(withInputs: inputs, outputNames: [name], runOptions: nil)[name] else {
            throw EmbedderError.noOutput(name)
        }
        let dims = try output.tensorTypeAndShapeInfo().shape.map(\.intValue)
        let data = try output.tensorData() as Data
        let values = data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
        if pooled {
            guard dims.count == 2, dims[0] == ids.count else { throw EmbedderError.shape(dims) }
            let size = dims[1]
            return (0..<ids.count).map { Array(values[$0 * size..<($0 + 1) * size]) }
        }
        guard dims.count == 3, dims[0] == ids.count, dims[1] == width else { throw EmbedderError.shape(dims) }
        let size = dims[2]
        return (0..<ids.count).map { row in
            var sum = [Float](repeating: 0, count: size)
            for column in 0..<ids[row].count {
                let at = (row * width + column) * size
                for k in 0..<size { sum[k] += values[at + k] }
            }
            return sum.map { $0 / Float(ids[row].count) }
        }
    }

    enum EmbedderError: Error, CustomStringConvertible {
        case noOutput(String), shape([Int])
        var description: String {
            switch self {
            case .noOutput(let name): "the model gave no \(name)"
            case .shape(let dims): "the model's output has the shape \(dims)"
            }
        }
    }
}
