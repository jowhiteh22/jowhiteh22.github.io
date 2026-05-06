// Event datasets
const EVENT_FILES = {
  women_3m: "data/women_3m.csv",
  men_3m: "data/men_3m.csv",
  women_10m: "data/women_10m.csv",
  men_10m: "data/men_10m.csv"
};

const EVENT_META = {
  women_3m: { gender: "F", event: "3m", rounds: 5 },
  men_3m: { gender: "M", event: "3m", rounds: 6 },
  women_10m: { gender: "F", event: "10m", rounds: 5 },
  men_10m: { gender: "M", event: "10m", rounds: 6 }
};

// HTML elements and D3 selections
const yearFilter = document.getElementById("yearFilter");
const eventFilter = document.getElementById("eventFilter");
const helpToggle = document.getElementById("helpToggle");
const helpPanel = document.getElementById("helpPanel");
const tooltip = d3.select("#tooltip");
const rankTable = d3.select("#rankTable");
const diveCompare = d3.select("#diveCompare");
const finalRankingsTitle = document.getElementById("finalRankingsTitle");

//Screen Reader support
const srSummary = d3.select("body")
  .append("div")
  .attr("id", "sr-summary")
  .attr("class", "sr-only")
  .attr("aria-live", "polite");

const state = {
  byEvent: {},
  records: [],
  divesLookup: {},
  selectedDiver: null,
  selectedDot: null,
  selectedDivers: new Set(), // Track two divers for comparison
  selectionSource: null // "plot" or "table" to control line visibility behavior
};

// Data Helper Functions
function parseNumber(value) {
  // Convers string to number
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toLongRows(row, eventKey) {
  // Takes one diver's row of data and makes it into multiple rows of one row per dive round
  const rounds = EVENT_META[eventKey].rounds;
  const longRows = [];

  for (let i = 1; i <= rounds; i++) {
    longRows.push({
      name: row.athelete,
      country: row.country,
      year: +row.Olympic_Year,
      gender: row.Gender,
      event: row.Event,
      eventKey,
      rank: +row.final_rank,
      round: i,
      divePoints: parseNumber(row[`R${i}_dive_points`]),
      cumulativePoints: parseNumber(row[`R${i}_total_points`]),
      diveNumber: i,
      diveCode: row[`R${i}_dive_no`],
      degreeDifficulty: parseNumber(row[`R${i}_dd`])
    });
  }

  return longRows;
}

async function loadAllData() {
  // Loads all csv files and then stores event data by category, converts all data into one dataset called state.records and builds a lookup table for the dive codes to get dive names
  const entries = Object.entries(EVENT_FILES);

  const [loadedEvents, divesData] = await Promise.all([
    Promise.all(entries.map(([, path]) => d3.csv(path))),
    d3.csv("data/dives.csv")
  ]);

  entries.forEach(([eventKey], idx) => {
    state.byEvent[eventKey] = loadedEvents[idx];
  });

  state.records = entries.flatMap(([eventKey]) =>
    state.byEvent[eventKey].flatMap((row) => toLongRows(row, eventKey))
  );

  divesData.forEach((d) => {
    state.divesLookup[d.dive_no] = d.dive_name;
  });
}

function filteredRows() {
  // Filters the dataset based on selected year, event, and gender and returns only data needed for the current view
  const selectedYear = +yearFilter.value;
  const selectedEventKey = eventFilter.value;
  const meta = EVENT_META[selectedEventKey];

  return state.records.filter(
    (d) =>
      d.year === selectedYear &&
      d.gender === meta.gender &&
      d.event === meta.event &&
      d.eventKey === selectedEventKey
  );
}

function showTooltip(event, d) {
  // Shows the tooltip box when hovering over a data point
  const diveName =
    state.divesLookup[d.diveCode] || `Unknown (${d.diveCode})`;

  tooltip
    .classed("hidden", false)
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 14}px`)
    .html(
      `<strong>${d.name}</strong><br>` +
      `Dive points: ${d.divePoints.toFixed(2)}<br>` +
      `Cumulative total: ${d.cumulativePoints.toFixed(2)}<br>` +
      `Dive Performed: ${diveName}<br>` +
      `Degree of difficulty: ${d.degreeDifficulty.toFixed(2)}`
    );
}

function hideTooltip() {
  // Hide tooltip when mouse is no longer over a data point
  tooltip.classed("hidden", true);
}

/* help panel toggle */
function setHelpPanelOpen(isOpen) {
  helpPanel.hidden = !isOpen;
  helpToggle.setAttribute("aria-expanded", String(isOpen));
  helpToggle.textContent = isOpen ? "Hide Diving Insights" : "Show Diving Insights";
}

function getRankings(baseData) {
  // Groups data by diver and sorts each diver's rounds, gets final round score, and builds a ranking list sorted y final score to produce the leaderboard table.
  const byDiver = d3.group(baseData, (d) => d.name);

  return Array.from(byDiver, ([name, rows]) => {
    const sorted = rows.slice().sort((a, b) => a.round - b.round);
    const finalRound = sorted[sorted.length - 1];

    return {
      name,
      country: finalRound.country,
      rank: +finalRound.rank,
      finalScore: finalRound.cumulativePoints
    };
  }).sort((a, b) => a.rank - b.rank);
}

function getFinalRankingsTitle() {
  // Builds heading text from selected filters (e.g., Final Ranking: Women 3M, 2024)
  const selectedYear = yearFilter.value;
  const [genderRaw, eventRaw] = eventFilter.value.split("_");
  const gender = genderRaw.charAt(0).toUpperCase() + genderRaw.slice(1).toLowerCase();
  const event = (eventRaw || "").toUpperCase();
  return `Final Ranking: ${gender} ${event}, ${selectedYear}`;
}

function renderTable(rankings) {
  // Builds the ranking table, allows clicking rows to select up to two divers for comparison
  rankTable.selectAll("*").remove();

  // Add instructions
  rankTable.append("p")
    .attr("class", "table-instructions")
    .attr("id", "table-instr")
    .html("<strong>Click</strong> one row to view diver in Performance Progression Plot. <strong>Click</strong> a second row to compare two divers. <strong>Click again</strong> to deselect.");

  const table = rankTable.append("table");
  const thead = table.append("thead").append("tr");

  thead.append("th").text("Rank");
  thead.append("th").text("Diver");
  thead.append("th").text("Country");
  thead.append("th").text("Final Score");

  const tbody = table.append("tbody");

  const rows = tbody
    .selectAll("tr")
    .data(rankings)
    .join("tr")
    .classed("active", (d) => state.selectedDivers.has(d.name))
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (d) => {
      const isSelected = state.selectedDivers.has(d.name);
      return `${d.rank}. ${d.name} from ${d.country} with score ${d.finalScore.toFixed(2)}. ${isSelected ? "Selected" : "Press Enter to select"}.`;
    })
    .on("click", (_, d) => {
      state.selectionSource = "table";
      if (state.selectedDivers.has(d.name)) {
        state.selectedDivers.delete(d.name);
      } else {
        if (state.selectedDivers.size >= 2) {
          state.selectedDivers.clear();
        }
        state.selectedDivers.add(d.name);
      }
      if (state.selectedDivers.size === 0) {
        state.selectionSource = null;
      }
      renderAll();
    })
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectionSource = "table";
        if (state.selectedDivers.has(d.name)) {
          state.selectedDivers.delete(d.name);
        } else {
          if (state.selectedDivers.size >= 2) {
            state.selectedDivers.clear();
          }
          state.selectedDivers.add(d.name);
        }
        if (state.selectedDivers.size === 0) {
          state.selectionSource = null;
        }
        renderAll();
      }
    });

  rows.append("td").text((d) => d.rank);
  rows.append("td").attr("class", "rank-name").text((d) => d.name);
  rows.append("td").text((d) => d.country);
  rows.append("td").text((d) => d.finalScore.toFixed(2));
}

function renderDiveComparison(baseData) {
  // Creates mini bar chart showing diver's score vs average for that dive code in this event/year
  diveCompare.selectAll("*").remove();

  if (!state.selectedDot) {
    diveCompare.append("p")
      .attr("class", "mini-placeholder")
      .text("Click a data point on the line chart to populate this view.");
    return;
  }

  const target = state.selectedDot;
  
  // Get the selected event and year
  const selectedYear = +yearFilter.value;
  const selectedEventKey = eventFilter.value;
  const meta = EVENT_META[selectedEventKey];
  
  // Filter to only this year and event for average calculation
  const eventRoundsData = baseData.filter(
    (d) => 
      d.year === selectedYear &&
      d.diveCode === target.diveCode
  );

  // Calculate average for this dive code in this event/year
  const diveAvg = eventRoundsData.length > 0 
    ? d3.mean(eventRoundsData, (d) => d.divePoints) 
    : 0;

  // Get dive name from lookup
  const diveName = state.divesLookup[target.diveCode] || `Unknown (${target.diveCode})`;

  const chartRows = [
    { label: target.name, value: target.divePoints, fill: "#3b82f6" },
    { label: "Event Average", value: diveAvg, fill: "#94a3b8" }
  ];

  const width = 320;
  const height = 280;
  const margin = { top: 56, right: 20, bottom: 96, left: 56 };

  const x = d3.scaleBand()
    .domain(chartRows.map((d) => d.label))
    .range([margin.left, width - margin.right])
    .padding(0.35);

  const y = d3.scaleLinear()
    .domain([0, d3.max(chartRows, (d) => d.value) * 1.18 || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const svg = diveCompare.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", `${diveName} score comparison for ${target.name} vs event average in ${selectedEventKey} - ${selectedYear}`)
    .attr("width", "100%")
    .attr("height", "auto");

  // Title with dive code and dive name
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "600")
    .style("fill", "#1f2937")
    .text(`${target.diveCode}: ${diveName}`);

  // Axes
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickSizeOuter(0))
    .selectAll("text")
    .style("font-size", "14px")
    .attr("dy", "1.15em")
    .attr("transform", "rotate(-15)")
    .style("text-anchor", "middle");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSizeOuter(0))
    .selectAll("text")
    .style("font-size", "14px");

  // Axis Labels
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 16)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("fill", "#475569")
    .text("Diver vs Average");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(height / 2))
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("fill", "#475569")
    .text("Dive Score");

  // Bars
  svg.selectAll("rect")
    .data(chartRows)
    .join("rect")
    .attr("x", (d) => x(d.label))
    .attr("y", (d) => y(d.value))
    .attr("width", x.bandwidth())
    .attr("height", (d) => y(0) - y(d.value))
    .attr("fill", (d) => d.fill)
    .attr("role", "img")
    .attr("aria-label", (d) => `${d.label}: ${d.value.toFixed(2)} points`);

  // Value labels on bars
  svg.selectAll("text.val")
    .data(chartRows)
    .join("text")
    .attr("class", "val")
    .attr("x", (d) => x(d.label) + x.bandwidth() / 2)
    .attr("y", (d) => y(d.value) - 6)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("fill", "#1f2937")
    .style("font-weight", "600")
    .text((d) => d.value.toFixed(2));

  srSummary.html(
    `Dive: ${target.diveCode} (${diveName}). ` +
    `${target.name} scored ${target.divePoints.toFixed(2)} points. ` +
    `Average for this dive code in ${selectedEventKey} ${selectedYear}: ${diveAvg.toFixed(2)} points.`
  );
}

function renderChart(baseData, chartData) {
  // Creates main score performance line chart with enhanced accessibility
  const chartEl = d3.select("#chart");
  chartEl.selectAll("*").remove();

  // Add instructions for chart interaction
  const chartInstructions = chartEl.append("p")
    .attr("class", "chart-instructions")
    .attr("id", "chart-instr")
    .html("<strong>INSTRUCTION:</strong> <strong>Click</strong> on a line to select a diver. <mark><strong>Scroll down</strong></mark> to see diver vs average. <strong>Click again</strong> to deselect. <strong>Hover</strong> over points to see details.");

  const width = Math.max(860, chartEl.node().clientWidth || 860);
  const height = 620;
  const margin = { top: 26, right: 40, bottom: 60, left: 72 };

  const rounds = [...new Set(baseData.map((d) => d.round))].sort((a, b) => a - b);

  const x = d3.scalePoint()
    .domain(rounds)
    .range([margin.left, width - margin.right])
    .padding(0.5);

  const y = d3.scaleLinear()
    .domain([0, d3.max(baseData, (d) => d.cumulativePoints) * 1.08])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const names = [...new Set(baseData.map((d) => d.name))];

  const color = d3.scaleOrdinal()
    .domain(names)
    .range(d3.quantize(d3.interpolateRainbow, names.length));

  const svg = chartEl.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", `Olympic diving performance line chart showing cumulative scores by round for ${eventFilter.value} in ${yearFilter.value}`)
    .attr("aria-describedby", "chart-instr")
    .attr("width", "100%")
    .attr("height", "auto");

  // Add subtitle
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", 24)
    .attr("text-anchor", "middle")
    .style("font-size", "20px")
    .style("font-weight", "600")
    .style("fill", "#1f2937")
    .text(`Performance Progression - ${eventFilter.value.replace(/_/g, " ")} (${yearFilter.value})`);

  // Axes
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickSizeOuter(0))
    .selectAll("text")
    .style("font-size", "16px");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSizeOuter(0))
    .selectAll("text")
    .style("font-size", "16px");

  // Axis Labels
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 20)
    .attr("text-anchor", "middle")
    .style("font-size", "20px")
    .style("font-weight", "600")
    .style("fill", "#1f2937")
    .text("Dive Round");
  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(height / 2))
    .attr("y", 24)
    .attr("text-anchor", "middle")
    .style("font-size", "20px")
    .style("font-weight", "600")
    .style("fill", "#1f2937")
    .text("Cumulative Score");

  // Create Line
  const line = d3.line()
    .x((d) => x(d.round))
    .y((d) => y(d.cumulativePoints))
    .curve(d3.curveMonotoneX);

  const byDiver = d3.group(chartData, (d) => d.name);

  byDiver.forEach((rows, diver) => {
    const sorted = rows.sort((a, b) => a.round - b.round);

    svg.append("path")
      .datum(sorted)
      .attr("fill", "none")
      .attr("stroke", color(diver))
      .attr("stroke-width", 2.5)
      .attr("d", line)
      .attr("class", "line-path")
      .classed("active", state.selectedDivers.has(diver) || state.selectedDot?.name === diver)
      .classed(
        "faded",
        state.selectionSource === "plot" && state.selectedDivers.size > 0 && !state.selectedDivers.has(diver)
      )
      .attr("aria-label", `Line for ${diver}. Click to select this diver for comparison.`)
      .attr("role", "button")
      .attr("tabindex", 0)
      .on("click", () => {
        state.selectionSource = "plot";
        if (state.selectedDivers.has(diver)) {
          state.selectedDivers.delete(diver);
        } else {
          if (state.selectedDivers.size >= 2) {
            state.selectedDivers.clear();
          }
          state.selectedDivers.add(diver);
        }
        if (state.selectedDivers.size === 0) {
          state.selectionSource = null;
        }
        renderAll();
      })
      .on("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.selectionSource = "plot";
          if (state.selectedDivers.has(diver)) {
            state.selectedDivers.delete(diver);
          } else {
            if (state.selectedDivers.size >= 2) {
              state.selectedDivers.clear();
            }
            state.selectedDivers.add(diver);
          }
          if (state.selectedDivers.size === 0) {
            state.selectionSource = null;
          }
          renderAll();
        }
      })
      .on("mouseenter", () => {
        // Highlight the hovered line and fade others
        svg.selectAll(".line-path")
          .classed("faded", (d) => {
            // Get the diver name for this path
            const pathDiver = d[0]?.name;
            return pathDiver !== diver;
          });
      })
      .on("mouseleave", () => {
        // Restore fade state based on current selection
        svg.selectAll(".line-path")
          .classed("faded", (d) => {
            const pathDiver = d[0]?.name;
            return (
              state.selectionSource === "plot" &&
              state.selectedDivers.size > 0 &&
              !state.selectedDivers.has(pathDiver)
            );
          });
      });
  });

  svg.append("g")
    .selectAll("circle")
    .data(chartData)
    .join("circle")
    .attr("cx", (d) => x(d.round))
    .attr("cy", (d) => y(d.cumulativePoints))
    .attr("r", (d) => {
      const isSelectedDot =
        state.selectedDot &&
        d.name === state.selectedDot.name &&
        d.round === state.selectedDot.round &&
        d.year === state.selectedDot.year &&
        d.eventKey === state.selectedDot.eventKey;
      return isSelectedDot ? 8 : 5.5;
    })
    .attr("fill", (d) => color(d.name))
    .attr("stroke", "white")
    .attr("stroke-width", (d) => {
      const isSelectedDot =
        state.selectedDot &&
        d.name === state.selectedDot.name &&
        d.round === state.selectedDot.round &&
        d.year === state.selectedDot.year &&
        d.eventKey === state.selectedDot.eventKey;
      return isSelectedDot ? 3 : 1.5;
    })
    .attr("class", "line-dot")
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (d) =>
      `${d.name}, round ${d.round}, cumulative score ${d.cumulativePoints.toFixed(1)} points. Press Enter to see dive details.`
    )
    .on("mousemove", showTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      state.selectedDot = d;
      renderAll();
    })
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedDot = d;
        renderAll();
      }
    });

  srSummary.html(
    `Viewing ${eventFilter.value.replace(/_/g, " ")} diving from ${yearFilter.value}. ` +
    `${state.selectedDivers.size > 0 ? `Comparing ${Array.from(state.selectedDivers).join(" and ")}. ` : ""}` +
    `Lines show cumulative score progression across rounds.`
  );
}

function renderAll() {
  // Filters data, computes ranking, and redraws table, line chart and mini chart
  const baseData = filteredRows();

  if (finalRankingsTitle) {
    finalRankingsTitle.textContent = getFinalRankingsTitle();
  }

  const rankings = getRankings(baseData);

  // Plot selections fade other lines; table selections filter chart to selected rows only
  const chartData =
    state.selectionSource === "table" && state.selectedDivers.size > 0
      ? baseData.filter((d) => state.selectedDivers.has(d.name))
      : baseData;

  renderTable(rankings);
  renderChart(baseData, chartData);
  renderDiveComparison(baseData);
}

async function init() {
  await loadAllData();
  renderAll();

  setHelpPanelOpen(false);

  helpToggle.addEventListener("click", () => {
    setHelpPanelOpen(helpPanel.hidden);
  });

  yearFilter.addEventListener("change", () => {
    state.selectedDivers.clear();
    state.selectionSource = null;
    state.selectedDot = null;
    renderAll();
  });

  eventFilter.addEventListener("change", () => {
    state.selectedDivers.clear();
    state.selectionSource = null;
    state.selectedDot = null;
    renderAll();
  });
}

// Data Modal Functions
function openDataModal(event) {
  event.preventDefault();
  const modal = document.getElementById("dataModal");
  const tableContainer = document.getElementById("modalDataTable");
  tableContainer.innerHTML = "";
  
  const selectedYear = +yearFilter.value;
  const selectedEventKey = eventFilter.value;
  const meta = EVENT_META[selectedEventKey];
  
  const filteredData = state.records.filter(
    (d) =>
      d.year === selectedYear &&
      d.gender === meta.gender &&
      d.event === meta.event &&
      d.eventKey === selectedEventKey
  );
  
  if (filteredData.length === 0) {
    tableContainer.innerHTML = "<p>No data available for selected filters.</p>";
    modal.classList.add("show");
    return;
  }
  
  // Create table
  const table = document.createElement("table");
  table.setAttribute("role", "grid");
  table.setAttribute("aria-label", `Data table for ${selectedEventKey} - ${selectedYear}`);
  
  // Create header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const headers = ["Diver", "Country", "Round", "Dive Code", "Dive Points", "Cumulative Points", "Difficulty"];
  
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Create body
  const tbody = document.createElement("tbody");
  filteredData.sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.round - b.round;
  }).forEach((row) => {
    const tr = document.createElement("tr");
    
    const cells = [
      row.name,
      row.country,
      row.round,
      row.diveCode,
      row.divePoints.toFixed(2),
      row.cumulativePoints.toFixed(2),
      row.degreeDifficulty.toFixed(2)
    ];
    
    cells.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  tableContainer.appendChild(table);
  
  modal.classList.add("show");
  
  // Focus on close button
  setTimeout(() => {
    document.querySelector(".modal-close").focus();
  }, 0);
}

function closeDataModal() {
  const modal = document.getElementById("dataModal");
  modal.classList.remove("show");
}

// Close modal when clicking outside
window.addEventListener("click", (event) => {
  const modal = document.getElementById("dataModal");
  if (event.target === modal) {
    closeDataModal();
  }
});

// Close modal with Escape key
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDataModal();
  }
});

init();