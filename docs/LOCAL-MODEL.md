# Local language model for the demo

The onboard assistant (library assistant, local language model) works
without a model: it shows the library passages that match the question. With
a local model it also writes a short answer from those passages and cites
each one. This guide sets up such a model on the pitch laptop with
[Ollama](https://ollama.com/download). It is optional; without it Demify
behaves exactly as before.

Research prototype, not a certified medical device. The assistant advises and
never decides: the crew and, when the ground link is up, the flight surgeons
make every medical decision.

Everything runs on this machine. The model download needs a network
connection once; the demo itself does not.

**Contents**

1. [Which model on which device](#1-which-model-on-which-device)
2. [Set it up](#2-set-it-up)
3. [What the model does and does not do](#3-what-the-model-does-and-does-not-do)
4. [What was tested](#4-what-was-tested)
5. [Switch the model or turn it off](#5-switch-the-model-or-turn-it-off)
6. [Before the pitch](#6-before-the-pitch)
7. [Troubleshooting](#7-troubleshooting)
8. [Licences](#8-licences)

---

## 1. Which model on which device

The installer ([`INSTALL.md`](INSTALL.md)) picks the model with these rules,
checked in this order, and prints the rule it used. `install.sh` and
`install.ps1` use the same rules; `--model` (`-Model`) overrides them, and
`bash install.sh --show-model` (`-ShowModel`) shows the choice without
installing anything.

1. NVIDIA DGX Spark (GPU name GB10), or an NVIDIA GPU with 16 GB or more of
   video memory (`nvidia-smi` reports 15,000 MiB or more), or Apple silicon
   with 32 GB or more of unified memory: **`gpt-oss:20b`**.
2. 8.5 GB of memory (RAM) or less: **`gemma3:1b`**.
3. Anything else: **`gemma3:4b`**.

How it finds out: Windows reads the memory with CIM (`Win32_ComputerSystem`;
in Git Bash from `/proc/meminfo`), macOS with `sysctl hw.memsize` and
`uname -m` / `hw.optional.arm64`, Linux from `/proc/meminfo`; the NVIDIA GPU
everywhere with `nvidia-smi --query-gpu=name,memory.total`.

| Device | Model | Download (approx.) | Why |
|---|---|---|---|
| Laptop without a GPU, 16 GB of memory (the pitch laptop) | `gemma3:4b` | 3.3 GB | **Default.** Runs on the CPU; answered the example questions in 9 to 49 seconds on 4 CPU cores (section 4) |
| Machine with about 8 GB of memory | `gemma3:1b` | 0.8 GB | Leaves memory for Docker Desktop, the browser and the slides. Weaker wording; not tested yet |
| NVIDIA GPU with 16 GB or more, or Apple silicon with 32 GB or more of unified memory | `gpt-oss:20b` | 14 GB | Stronger answers. A mixture-of-experts model: fast where the memory is fast |
| NVIDIA DGX Spark, with the installer | `gpt-oss:20b` | 14 GB | The installer recognises the GB10 and starts the single-container Demify with this model |
| NVIDIA DGX Spark (onboard server) | `gpt-oss:20b`, option `gpt-oss:120b` (65 GB) | | Runs inside [`docker-compose.spark.yml`](../docker-compose.spark.yml), not with this guide; see [`SPARK.md`](SPARK.md) |

Why a small model is enough for the demo: the model does not search and does
not know the answers. Demify finds the passages and checks them; the model
only turns at most five of them into a few sentences with citations. A
bigger model follows the rules (cite every statement, say when the passages
do not answer) more reliably, so the onboard server uses one.

The pitch setup needs no embedding model: without a database Demify finds
passages by keyword search, and the status strip shows the language model as
ready on this machine. The onboard server's database search uses
`nomic-embed-text` (0.3 GB); `--with-embed` (`-WithEmbed` on Windows) pulls
it too.

## 2. Set it up

**Easiest: the installer.** `bash install.sh` (Windows PowerShell:
`powershell -ExecutionPolicy Bypass -File install.ps1`) also installs Docker
and Ollama when they are missing, picks the model (section 1) and then runs
the setup script below for you. Step by step: [`INSTALL.md`](INSTALL.md).

The setup scripts alone are for a machine that already has Docker and
Ollama. You need:

- Docker: Docker Desktop on macOS and Windows (on Windows with the WSL 2
  backend), Docker Engine on Linux; the same as for the pitch setup in the
  [README](../README.md#quick-start).
- Ollama from <https://ollama.com/download>, installed and running.
- About 4 GB of free disk for `gemma3:4b`.

### macOS, Linux and Windows with Git Bash

```bash
bash scripts/setup-local-model.sh                     # gemma3:4b
bash scripts/setup-local-model.sh --model gemma3:1b   # another model
npm run model:setup                                   # the same, if Node is installed
```

### Windows (PowerShell 5 or later)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-local-model.ps1
powershell -ExecutionPolicy Bypass -File scripts\setup-local-model.ps1 -Model gemma3:1b
```

On Windows use the PowerShell script or Git Bash, not the shell script
inside WSL: Ollama for Windows runs on Windows itself.

### What the script does

It is safe to run again, never uses `sudo` or administrator rights, and
stores no secret.

1. Checks that Ollama answers on `http://127.0.0.1:11434` and that Docker
   runs. If Ollama is missing it prints the download link and stops.
2. Shows the memory (and an NVIDIA GPU, if any) it finds and which model
   suits the machine. This is a hint; it uses `gemma3:4b` unless you choose
   another model.
3. Runs `ollama pull <model>` (with `--with-embed` also
   `ollama pull nomic-embed-text`). Without a connection it keeps a copy that
   is already on the machine.
4. Sets two lines in `.env` (and creates `.env` from `.env.example` if it is
   missing). It changes no other line:

   ```dotenv
   DEMIFY_MODEL_URL=http://host.docker.internal:11434/v1
   DEMIFY_LLM_MODEL=gemma3:4b
   ```

5. Runs `docker compose -f docker-compose.yml up -d --build`.
6. Waits until `GET /api/onboard/status` reports the model (up to 240 s).
7. Asks one test question ("Where is the pulse oximeter in the medical
   kit?") and shows the result and how long it took. This also loads the
   model into memory.

| Option (`.sh`) | Option (`.ps1`) | Meaning |
|---|---|---|
| `--model <name>` | `-Model <name>` | Ollama model (default `gemma3:4b`) |
| `--with-embed` | `-WithEmbed` | Also pull `nomic-embed-text` (onboard database only) |
| `--no-test` | `-NoTest` | Skip the test question |
| `--timeout <s>` | `-TimeoutSeconds <s>` | How long to wait for the status (240) |
| `--ollama <path>` | `-OllamaExe <path>` | The Ollama program, when it is not on PATH yet (the installer passes it after a fresh install) |
| `--dry-run` | `-DryRun` | Print the commands instead of running them |
| `--from-installer` | `-FromInstaller` | Used by the installer: no model hint, no closing summary |

The script refuses a `.env` made for the DGX Spark
(`COMPOSE_FILE=docker-compose.spark.yml`): the Spark runs its own model
server.

### Linux: Ollama must listen on the Docker bridge

The container reaches Ollama as `host.docker.internal` (the `extra_hosts`
entry in [`docker-compose.yml`](../docker-compose.yml)). Docker Desktop on
macOS and Windows forwards that name to Ollama on `127.0.0.1` by itself. With
Docker Engine on Linux the traffic arrives on the Docker bridge, and Ollama
listens on `127.0.0.1` only unless told otherwise. The script checks this
and, if needed, stops with these steps (it does not change system settings
itself):

```bash
sudo systemctl edit ollama.service
#   add in the editor, then save and close:
#   [Service]
#   Environment="OLLAMA_HOST=0.0.0.0"
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

If you start Ollama by hand instead: `OLLAMA_HOST=0.0.0.0 ollama serve`.
Ollama then also answers on your network on port 11434. On a shared network
block that port in your firewall for everything but Docker. With `ufw`, the
Docker networks also need a rule:
`sudo ufw allow from 172.16.0.0/12 to any port 11434 proto tcp`.

### Without the script

```bash
ollama pull gemma3:4b
# add the two lines from step 4 to .env, then:
docker compose up -d --build
curl -s http://127.0.0.1:3000/api/onboard/status   # "model": {"state": "ready", ...}
```

`docker-compose.yml` passes `DEMIFY_MODEL_URL`, `DEMIFY_LLM_MODEL`,
`DEMIFY_EMBED_MODEL`, `DEMIFY_LLM_TIMEOUT_MS` and `DEMIFY_ASSISTANT_MIN_SCORE`
to the container, all empty by default (empty = no model). It always adds
`host.docker.internal` to `NO_PROXY`, so questions never go through a
proxy. The air-gapped `offline` profile never gets a model URL: it has no
route to the host.

## 3. What the model does and does not do

With the pitch setup there is no database. For each question:

1. Demify searches the library bundled with this release by keywords and
   takes the best passages (at most five, each at most 1,200 characters).
   It checks each passage's SHA-256 before using it.
2. Questions about medicines or doses are declined before any search, and a
   question the library does not cover gets "The onboard library has no good
   answer to this" without asking the model.
3. The model gets only those passages and fixed rules: answer from them and
   nothing else, cite every statement with its passage number, reply that
   the passages do not answer when they do not, never name a medicine, a
   dose, an amount or a schedule, at most six sentences, in the language of
   the question.
4. Demify checks the answer before showing it: every statement must cite a
   passage, it must not contain a dose, an amount or a schedule, and its
   words must come from the cited passages. An answer that fails is not
   shown; the passages are shown instead, with the reason.
5. The answer shows the model's name, every cited passage (title, section,
   source, review status, version) and how old the library is.

The model never raises or clears an alarm; the rule engine and the alarms
stay primary and do not use it. A small model can still word a passage
wrongly (section 4 has an example), so the cited passage, not the model's
sentence, is the reference: open it with "Show the whole passage".

## 4. What was tested

On 14 November 2026, with commit `42f38bc` (before the answer checks of step 4
in section 3 were extended), on a Linux machine with 4 CPU cores, 16 GB of
memory and no GPU, shared with other work. Ollama 0.40.16 ran in Docker with
`gemma3:4b` (Q4_K_M) and `nomic-embed-text`; Demify was built from
`docker-compose.yml`.

- **Setup script (`.sh`), end to end:** stopped with the instructions of
  section 2 while Ollama listened on `127.0.0.1` only; then pulled the
  models, created `.env`, built and started Demify, saw the status `ready`
  and the test question answered in 13 s. A second run changed nothing in
  `.env`. Also checked: pulling through the Ollama API when the `ollama`
  command is missing, a `DEMIFY_MODEL_URL` in the shell (ignored), a missing
  embedding model (accepted with a note).
- **The six example questions** of the Onboard assistant page: all six
  answered with citations, in 9 to 49 seconds each. One answer worded a
  passage wrongly: the blackout procedure says "Prepare the report for the
  flight surgeon"; the answer said "The flight surgeon prepares a report".
- **"What is the best treatment for a kidney stone?"**: no answer, without
  calling the model.
- **A German question** ("Wo ist das Pulsoximeter im Medizinkit?"): no answer.
  The keyword search finds no German words in the English library, so ask
  in English.
- **Without the two lines in `.env`:** status `not-configured`, the
  assistant shows passages only, all pages load: the same as before.

The installer (`install.sh`), later on 14 November 2026, on the same Linux
machine (16 GB, no GPU; Docker Engine and Ollama already installed, the
Ollama registry not reachable):

- **First run** in a fresh copy of the repository, started from another
  folder: found Docker and Ollama, chose `gemma3:4b` ("15.7 GB of memory and
  no NVIDIA GPU with 16 GB or more"), wrote `.env`, built and started Demify,
  status `ready`, the test question answered in 60 s (including loading the
  model), 2 minutes 5 seconds in all.
- **Second run:** 3 seconds, `.env` unchanged byte for byte, the container
  kept.
- **Port taken by another program:** without a terminal it stopped with the
  instructions; with `--yes` it moved Demify to the next free port and wrote
  `DEMIFY_PORT` to `.env`.
- **`--no-model`:** Demify started, status `not-configured`.
- **Model choice and the install steps for other systems** with the test
  hooks of `--show-model` and `--dry-run` (Windows with Git Bash, macOS,
  Linux, DGX Spark; bash 3.2 as on macOS). CI repeats the model choice for
  both installers on every push.

Not tested: macOS, Windows (neither installer nor setup script has run there
yet; the PowerShell scripts were reviewed, and CI parses them and runs the
model choice of `install.ps1` on every push), installing Docker or Ollama for
real, a GPU, `gemma3:1b`, `gpt-oss` on a laptop. Repeat the example questions
on the pitch laptop after any change:

```bash
for q in "The monitor shows ventricular fibrillation. What does the drill checklist say?" \
         "Where is the pulse oximeter in the medical kit?"; do
  curl -s http://127.0.0.1:3000/api/assistant -H 'Content-Type: application/json' \
    -d "{\"question\":\"$q\"}" | jq '{status, model: .mode.model, answer, reason}'
done
```

## 5. Switch the model or turn it off

- **Another model:** run the script again with `--model <name>` (`-Model` on
  Windows). Or change `DEMIFY_LLM_MODEL` in `.env`, run `ollama pull <name>`
  and `docker compose up -d`.
- **No model:** delete the `DEMIFY_MODEL_URL` line in `.env` (or leave the
  value empty) and run `docker compose up -d`. The assistant shows passages
  only.
- **Free the disk space:** `ollama rm gemma3:4b`.

## 6. Before the pitch

- Run the script at home or wherever the network works; the download is the
  only step that needs it.
- Ollama unloads a model after 5 idle minutes, so the next question waits
  for it to load again (seconds on a laptop SSD). Ask one question shortly
  before you present, or keep the model loaded longer by setting
  `OLLAMA_KEEP_ALIVE=1h` for Ollama (macOS: `launchctl setenv
  OLLAMA_KEEP_ALIVE 1h`, then quit and reopen the Ollama app; Windows: a user
  environment variable, then restart Ollama; Linux: another `Environment=`
  line in the systemd override above).
- Answers take tens of seconds on a CPU. If one runs into the limit
  (passages shown with "The language model did not answer in time"), set
  `DEMIFY_LLM_TIMEOUT_MS=180000` in `.env` and run `docker compose up -d`, or
  use `gemma3:1b`.
- Close other heavy programs: the model needs its 3 to 4 GB while it answers.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Script: "Ollama is not installed" | Nothing answers on port 11434 | Install from <https://ollama.com/download> and start it |
| Script: "installed but not running" | Ollama app closed | macOS/Windows: open Ollama; Linux: `sudo systemctl start ollama` |
| Script (Linux): "listens on 127.0.0.1 only" | Default Ollama setting | Section 2, Linux |
| Script: "could not pull" | Model name wrong, or no connection | Check the name on <https://ollama.com/library> |
| Status `unreachable` | Ollama stopped, or (Linux) a firewall blocks the Docker networks | Start Ollama; `ufw` rule in section 2; then `docker compose restart demify` |
| Status `not-configured` | `.env` has no `DEMIFY_MODEL_URL`, or the container was not recreated | Run the script again, or `docker compose up -d` |
| Passages shown: "did not answer in time" | Slow CPU, model loading | Section 6 |
| Passages shown: the answer "did not cite the library" or "used words that the cited library passages do not contain" | The model ignored the rules for that question | Expected now and then with a small model; the passages are the answer. A bigger model helps |
| Answers ignore later passages | Prompt longer than the model's context (Ollama used 4,096 tokens in the test; Demify's prompt stays well below) | Set `OLLAMA_CONTEXT_LENGTH=8192` for Ollama, as for `OLLAMA_KEEP_ALIVE` |
| Image build fails with `SELF_SIGNED_CERT_IN_CHAIN` | TLS-intercepting proxy | `DEMIFY_BUILD_CA`, see [`DEPLOYMENT.md` section 4](DEPLOYMENT.md#4-behind-a-proxy--custom-ca) |
| Windows: "running scripts is disabled on this system" | Execution policy | Start it with `powershell -ExecutionPolicy Bypass -File ...` as shown |

## 8. Licences

Demify does not ship model weights. The script asks Ollama to download them
from the Ollama registry onto this machine; their licences apply there.

| Component | Licence | Notes |
|---|---|---|
| `gemma3:1b`, `gemma3:4b` (Google) | Gemma Terms of Use | Not an open-source licence. Use must follow the Gemma Prohibited Use Policy, which the terms include by reference. Whoever passes the model on must pass on these use restrictions and a notice. `ollama show gemma3:4b --license` prints the terms. Read both before using Gemma beyond this demo |
| `gpt-oss:20b`, `gpt-oss:120b` (OpenAI) | Apache-2.0 | Used on the onboard server ([`SPARK.md`](SPARK.md)) |
| `nomic-embed-text` (Nomic) | Apache-2.0 | `ollama show nomic-embed-text --license` |
| Ollama | MIT | The model server on this machine |
