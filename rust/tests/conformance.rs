use std::fs;
use std::path::Path;

/// Loads every shared fixture. Cases are reported as pending until the
/// validator and flattener are implemented.
#[test]
fn conformance_fixtures_load() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../conformance");
    let mut total = 0;
    for dir in ["validate", "flatten"] {
        let mut found = 0;
        for entry in fs::read_dir(root.join(dir)).expect("conformance dir") {
            let path = entry.unwrap().path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let text = fs::read_to_string(&path).unwrap();
            let file: serde_json::Value = serde_json::from_str(&text)
                .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            let cases = file["cases"].as_array().expect("cases array");
            found += 1;
            total += cases.len();
        }
        assert!(found > 0, "no fixtures in conformance/{dir}");
    }
    eprintln!("{total} conformance cases pending implementation");
}
