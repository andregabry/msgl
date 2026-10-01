using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace Enging.MigrationGoogleGroupsM365;

internal static class Program
{
    private const string ProductName = "Migração Google Groups → M365";

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);

    [STAThread]
    private static int Main()
    {
        using var mutex = new Mutex(true, "Local\\Enging.MigracaoGoogleGroupsM365", out var isFirstInstance);
        if (!isFirstInstance)
        {
            ShowMessage("O aplicativo já está aberto.", error: false);
            return 0;
        }

        Process? server = null;
        try
        {
            var appRoot = AppContext.BaseDirectory;
            var systemRoot = Path.Combine(appRoot, "Resources", "MigrationSystem");
            var runtimeRoot = Path.Combine(appRoot, "Runtime");
            var powerShellRoot = Path.Combine(runtimeRoot, "powershell");
            var gcloudRoot = Path.Combine(runtimeRoot, "google-cloud-sdk");
            var python = Path.Combine(gcloudRoot, "platform", "bundledpython", "python.exe");
            var pwsh = Path.Combine(powerShellRoot, "pwsh.exe");
            var gcloud = Path.Combine(gcloudRoot, "bin", "gcloud.cmd");
            var serviceAccount = Path.Combine(appRoot, "Resources", "Private", "service-account.json");
            var serverScript = Path.Combine(systemRoot, "interface", "server.py");
            if (!File.Exists(serverScript))
            {
                throw new FileNotFoundException("O pacote está incompleto: interface\\server.py não foi encontrado.");
            }

            RequirePackagedFile(python, "Python incluído");
            RequirePackagedFile(pwsh, "PowerShell incluído");
            RequirePackagedFile(gcloud, "Google Cloud CLI incluído");
            RequirePackagedFile(serviceAccount, "configuração privada da conta de serviço Google");

            var dataRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Enging",
                "MigracaoGoogleGroupsM365"
            );
            Directory.CreateDirectory(dataRoot);
            var configPath = EnsureRuntimeConfig(dataRoot, python, serviceAccount);
            var gcloudConfig = Path.Combine(dataRoot, "gcloud");
            Directory.CreateDirectory(gcloudConfig);

            var startInfo = new ProcessStartInfo
            {
                FileName = python,
                WorkingDirectory = systemRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            startInfo.ArgumentList.Add(serverScript);
            startInfo.Environment["MIGRATION_CONFIG_PATH"] = configPath;
            startInfo.Environment["PYTHONUNBUFFERED"] = "1";
            startInfo.Environment["CLOUDSDK_PYTHON"] = python;
            startInfo.Environment["CLOUDSDK_CONFIG"] = gcloudConfig;
            startInfo.Environment["PATH"] = JoinSearchPath(
                powerShellRoot,
                Path.Combine(gcloudRoot, "bin"),
                Path.GetDirectoryName(python)!,
                Environment.GetEnvironmentVariable("PATH") ?? string.Empty
            );
            startInfo.Environment["PSModulePath"] = JoinSearchPath(
                Path.Combine(powerShellRoot, "Modules"),
                Environment.GetEnvironmentVariable("PSModulePath") ?? string.Empty
            );

            server = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
            var addressReady = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            var errors = new StringBuilder();
            server.OutputDataReceived += (_, args) =>
            {
                if (args.Data?.StartsWith("Endereço: ", StringComparison.Ordinal) == true)
                {
                    addressReady.TrySetResult(args.Data["Endereço: ".Length..].Trim());
                }
            };
            server.ErrorDataReceived += (_, args) =>
            {
                if (!string.IsNullOrWhiteSpace(args.Data) && errors.Length < 8_000)
                {
                    errors.AppendLine(args.Data);
                }
            };

            if (!server.Start())
            {
                throw new InvalidOperationException("O servidor local não pôde ser iniciado.");
            }
            server.BeginOutputReadLine();
            server.BeginErrorReadLine();

            var completed = Task.WhenAny(addressReady.Task, Task.Delay(TimeSpan.FromSeconds(20)))
                .GetAwaiter().GetResult();
            if (completed != addressReady.Task)
            {
                throw new TimeoutException(
                    "O painel local não iniciou em 20 segundos." +
                    (errors.Length > 0 ? $"\n\n{errors}" : string.Empty)
                );
            }

            var browserPath = FindApplicationBrowser();
            if (browserPath is null)
            {
                throw new InvalidOperationException(
                    "Microsoft Edge ou Google Chrome não foi encontrado. Instale um dos navegadores para abrir a interface."
                );
            }

            var browserProfile = Path.Combine(dataRoot, "browser-profile");
            Directory.CreateDirectory(browserProfile);
            var browserInfo = new ProcessStartInfo
            {
                FileName = browserPath,
                UseShellExecute = false,
            };
            browserInfo.ArgumentList.Add($"--app={addressReady.Task.Result}");
            browserInfo.ArgumentList.Add($"--user-data-dir={browserProfile}");
            browserInfo.ArgumentList.Add("--no-first-run");
            browserInfo.ArgumentList.Add("--start-maximized");

            using var browser = Process.Start(browserInfo)
                ?? throw new InvalidOperationException("O navegador do aplicativo não pôde ser iniciado.");
            browser.WaitForExit();
            return 0;
        }
        catch (Exception error)
        {
            ShowMessage(error.Message, error: true);
            return 1;
        }
        finally
        {
            if (server is { HasExited: false })
            {
                try { server.Kill(entireProcessTree: true); }
                catch { /* The process may have exited between the check and cleanup. */ }
            }
            server?.Dispose();
        }
    }

    private static string EnsureRuntimeConfig(string dataRoot, string python, string serviceAccount)
    {
        var configDirectory = Path.Combine(dataRoot, "config");
        Directory.CreateDirectory(configDirectory);
        // A versioned filename prevents the incomplete configuration generated by
        // the first Windows package from being reused silently.
        var configPath = Path.Combine(configDirectory, "google-groups-system.windows-v2.psd1");
        if (File.Exists(configPath))
        {
            return configPath;
        }

        var documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        var m365Root = Path.Combine(documents, "M365");
        var googleGroupsRoot = Path.Combine(m365Root, "Google Groups");
        Directory.CreateDirectory(googleGroupsRoot);
        var workspace = Path.Combine(googleGroupsRoot, "_migration-system");
        var contents = $$"""
        @{
            WorkspaceRoot        = '{{PsQuote(workspace)}}'
            GoogleDomain         = 'enging.pt'
            GoogleAdmin          = 'andre.gabry@enging.pt'
            ExchangeAdmin        = 'andre.gabry@dynamox.net'
            M365TargetDomain     = 'dynamox.net'
            GoogleStagingOrgUnit = ''
            ServiceAccountFile   = '{{PsQuote(serviceAccount)}}'
            PythonPath           = '{{PsQuote(python)}}'
            MboxToPstPath        = ''
            MigrationEndpoint    = 'GoogleWorkspace'
            TargetDeliveryDomain = 'dynamox.net'
            GoogleTakeoutBucketRoot = 'gs://dwt-takeout-export--5522609548690436666/20260826T152249Z/'
            GoogleGroupsBackupRoot = '{{PsQuote(googleGroupsRoot)}}'
        }
        """;
        File.WriteAllText(configPath, contents + Environment.NewLine, new UTF8Encoding(false));
        return configPath;
    }

    private static string PsQuote(string value) => value.Replace("'", "''", StringComparison.Ordinal);

    private static void RequirePackagedFile(string path, string component)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"O pacote está incompleto: {component} não foi encontrado.", path);
        }
    }

    private static string JoinSearchPath(params string[] values) =>
        string.Join(Path.PathSeparator, values.Where(value => !string.IsNullOrWhiteSpace(value)));

    private static string? FindApplicationBrowser()
    {
        var roots = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        };
        var relativePaths = new[]
        {
            Path.Combine("Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine("Google", "Chrome", "Application", "chrome.exe"),
        };
        foreach (var root in roots.Where(path => !string.IsNullOrWhiteSpace(path)))
        {
            foreach (var relative in relativePaths)
            {
                var candidate = Path.Combine(root, relative);
                if (File.Exists(candidate)) return candidate;
            }
        }
        return null;
    }

    private static void ShowMessage(string message, bool error)
    {
        const uint ok = 0x00000000;
        const uint errorIcon = 0x00000010;
        const uint informationIcon = 0x00000040;
        MessageBox(IntPtr.Zero, message, ProductName, ok | (error ? errorIcon : informationIcon));
    }
}
