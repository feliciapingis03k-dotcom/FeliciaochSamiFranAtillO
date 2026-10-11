
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://yhhkkcdpytwauwsrbfwy.supabase.co";
const SUPABASE_KEY = "sb_publishable_tZxP7WP1setd_SNX9OMT4g_v3TYUKYB";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const letters = [
  "A", "B", "C", "D", "E", "F", "G",
  "H", "I", "J", "K", "L", "M", "N",
  "O", "P", "Q", "R", "S", "T", "U",
  "V", "W", "X", "Y", "Z", "Å", "Ä", "Ö"
];

const dateList = document.getElementById("date-list");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const resetButton = document.getElementById("reset-button");

let dates = {};
let channel;
let saveTimers = {};

function updateProgress() {
    const completed = letters.filter(letter => dates[letter]?.done).length;

    progressBar.style.width = `${(completed / letters.length) * 100}%`;
    progressText.textContent = `${completed} av ${letters.length} avklarade`;
}

function createDateItem(letter) {
    const item = document.createElement("div");
    item.className = "date-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", `Markera ${letter} som klar`);

    const label = document.createElement("span");
    label.className = "letter";
    label.textContent = letter;

    const input = document.createElement("input");
    input.className = "date-input";
    input.type = "text";
    input.placeholder = `något skojsigt på ${letter}`;
    input.setAttribute("aria-label", `Dejt för ${letter}`);

    checkbox.addEventListener("change", () => {
        dates[letter].done = checkbox.checked;
        item.classList.toggle("done", checkbox.checked);
        updateProgress();
        saveDate(letter);
    });

    input.addEventListener("input", () => {
        dates[letter].activity = input.value;
        saveDate(letter);
    });

    item.append(checkbox, label, input);

    // Referenser gör det möjligt att uppdatera raden vid fjärrändringar.
    item._checkbox = checkbox;
    item._input = input;
    return item;
}

    const items = {};

letters.forEach(letter => {
    dates[letter] = { done: false, activity: "" };
    items[letter] = createDateItem(letter);
    dateList.appendChild(items[letter]);
});

function displayDate(letter, data) {
    dates[letter] = {
        done: Boolean(data.done),
        activity: data.activity ?? ""
    };

    const item = items[letter];
    item._checkbox.checked = dates[letter].done;

    // Undvik att skriva över text som användaren håller på att redigera.
    if (document.activeElement !== item._input) {
        item._input.value = dates[letter].activity;
    }

    item.classList.toggle("done", dates[letter].done);
    updateProgress();
}

async function saveDate(letter) {
    // Fördröj sparandet lite när användaren skriver.
    clearTimeout(saveTimers[letter]);

    saveTimers[letter] = setTimeout(async () => {
        const data = {
        letter,
        activity: dates[letter].activity,
        done: dates[letter].done
        };

        const { error } = await supabase
        .from("dates")
        .upsert(data, { onConflict: "letter" });

        delete saveTimers[letter];

        if (error) {
        console.error("Kunde inte spara dejten:", error.message);
        progressText.textContent = "Kunde inte spara. Kontrollera anslutningen.";
        }
    }, 300);
}

async function loadDates() {
    const { data, error } = await supabase
        .from("dates")
        .select("letter, activity, done");

    if (error) {
        console.error("Kunde inte läsa dejterna:", error.message);
        progressText.textContent = "Kunde inte ladda listan. Kontrollera Supabase-inställningarna.";
        return;
    }

    data.forEach(row => {
        if (letters.includes(row.letter)) {
        displayDate(row.letter, row);
        }
    });

    // Skapa rader för bokstäver som saknas utan att skriva över befintliga.
    const existing = new Set(data.map(row => row.letter));
    const missing = letters
        .filter(letter => !existing.has(letter))
        .map(letter => ({
        letter,
        activity: "",
        done: false
        }));

    if (missing.length) {
        const { error: insertError } = await supabase
        .from("dates")
        .upsert(missing, { onConflict: "letter", ignoreDuplicates: true });

        if (insertError) {
        console.error("Kunde inte skapa saknade bokstäver:", insertError.message);
        }
    }
}

function subscribeToChanges() {
    channel = supabase
        .channel("shared-dates")
        .on(
        "postgres_changes",
        {
            event: "*",
            schema: "public",
            table: "dates"
        },
        payload => {
            if (payload.eventType === "DELETE") {
            const letter = payload.old.letter;
            if (letters.includes(letter)) {
                displayDate(letter, { activity: "", done: false });
            }
            return;
            }

            const row = payload.new;
            if (!letters.includes(row.letter)) return;

            // Uppdatera inte en rad medan den egna enheten väntar på att spara.
            if (saveTimers[row.letter]) return;

            displayDate(row.letter, row);
        })
        .subscribe(status => {
        if (status === "SUBSCRIBED") {
            console.log("Ansluten till gemensamma dejtlistan.");
        }
        });
}

resetButton.addEventListener("click", async () => {
    const confirmed = confirm(
        "Vill ni verkligen rensa alla era bokstäver och dejter?"
    );

    if (!confirmed) return;

    const { error } = await supabase
        .from("dates")
        .delete()
        .in("letter", letters);

    if (error) {
        console.error("Kunde inte rensa listan:", error.message);
        alert("Listan kunde inte rensas. Kontrollera anslutningen.");
        return;
    }

    letters.forEach(letter => {
        clearTimeout(saveTimers[letter]);
        delete saveTimers[letter];
        displayDate(letter, { activity: "", done: false });
    });
});

updateProgress();
await loadDates();
subscribeToChanges();
