using System.Text.Json;
using Xunit;

namespace Blockwell.Tests;

public class ConformanceTests
{
    private static string Root()
    {
        // Walk up from the test output directory to the repository root.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "conformance")))
        {
            dir = dir.Parent;
        }
        return dir?.FullName ?? throw new DirectoryNotFoundException("conformance directory not found");
    }

    /// <summary>Loads every shared fixture. Cases stay pending until the validator is implemented.</summary>
    [Theory]
    [InlineData("validate")]
    [InlineData("flatten")]
    public void FixturesLoad(string kind)
    {
        var files = Directory.GetFiles(Path.Combine(Root(), "conformance", kind), "*.json");
        Assert.NotEmpty(files);
        foreach (var file in files)
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(file));
            Assert.Equal(JsonValueKind.Array, doc.RootElement.GetProperty("cases").ValueKind);
        }
    }
}
