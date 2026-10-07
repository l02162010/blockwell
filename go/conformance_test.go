package blockwell

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type fixtureFile struct {
	Cases []struct {
		Name     string          `json:"name"`
		Doc      json.RawMessage `json:"doc"`
		Valid    *bool           `json:"valid"`
		Errors   []string        `json:"errors"`
		Expected json.RawMessage `json:"expected"`
	} `json:"cases"`
}

// TestConformance loads every shared fixture. Cases are skipped until the
// validator and flattener are implemented.
func TestConformance(t *testing.T) {
	for _, dir := range []string{"validate", "flatten"} {
		files, err := filepath.Glob(filepath.Join("..", "conformance", dir, "*.json"))
		if err != nil || len(files) == 0 {
			t.Fatalf("no fixtures found in conformance/%s", dir)
		}
		for _, file := range files {
			data, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			var f fixtureFile
			if err := json.Unmarshal(data, &f); err != nil {
				t.Fatalf("%s: %v", file, err)
			}
			for _, c := range f.Cases {
				t.Run(dir+"/"+filepath.Base(file)+"/"+c.Name, func(t *testing.T) {
					t.Skip("not implemented yet")
				})
			}
		}
	}
}
