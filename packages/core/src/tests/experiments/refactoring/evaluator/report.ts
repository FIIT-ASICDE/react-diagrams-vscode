import { writeFileSync } from 'node:fs';

import {
	METRIC_COLORS,
	METRIC_KEYS,
	METRIC_LABELS,
	type ExperimentReport,
	type FileSummary,
	type GroupReport,
	type MetricKey,
} from './types';

export function writeReportJson(report: ExperimentReport, reportPath: string) {
	writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export function writeReportHtml(report: ExperimentReport, reportPath: string) {
	writeFileSync(reportPath, renderHtmlReport(report), 'utf8');
}

export function renderHtmlReport(report: ExperimentReport) {
	const maxAbs = getReportScale(report);

	return /*html*/ `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Refactoring Experiment Report</title>
	<style>
		:root {
			color-scheme: light;
			font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			background: #f6f3ee;
			color: #23272f;
		}
		body {
			margin: 0;
			background: #f6f3ee;
		}
		main {
			width: min(1250px, calc(100vw - 48px));
			margin: 0 auto;
			padding: 26px 0 56px;
		}
		header {
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 24px;
			align-items: end;
			margin-bottom: 22px;
		}
		h1, h2, h3, p {
			margin: 0;
		}
		h1 {
			font-size: 30px;
			line-height: 1.15;
			font-weight: 760;
		}
		h2 {
			font-size: 22px;
			line-height: 1.2;
			margin-bottom: 10px;
		}
		.meta {
			color: #626b78;
			font-size: 13px;
			margin-top: 4px;
		}
		.summary {
			display: flex;
			gap: 10px;
			flex-wrap: wrap;
			justify-content: flex-end;
		}
		.pill {
			border: 1px solid #d8d1c5;
			border-radius: 999px;
			background: #fffaf2;
			padding: 7px 11px;
			font-size: 13px;
			white-space: nowrap;
		}
		.legend {
			display: flex;
			gap: 16px;
			flex-wrap: wrap;
			margin: 4px 2px 8px;
		}
		.legend-item {
			display: inline-flex;
			align-items: center;
			gap: 7px;
			color: #4e5561;
			font-size: 13px;
		}
		.swatch {
			width: 12px;
			height: 12px;
			border-radius: 3px;
		}
		section {
			background: #fffdf8;
			border: 1px solid #ddd5c9;
			border-radius: 8px;
			padding: 22px;
			margin-top: 10px;
			box-shadow: 0 1px 2px rgba(31, 35, 40, 0.06);
		}
		.group-head {
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 18px;
			align-items: start;
		}
		.overall {
			display: grid;
			grid-template-columns: repeat(4, minmax(105px, 1fr));
			gap: 8px;
			min-width: min(560px, 100%);
		}
		.overall-item {
			border: 1px solid #e3ddd3;
			border-radius: 6px;
			padding: 8px 9px;
			background: #fbf8f1;
		}
		.overall-label {
			color: #626b78;
			font-size: 12px;
			font-weight: 600;
		}
		.overall-value {
			font-size: 18px;
			font-weight: 720;
			margin-top: 3px;
		}
		.chart {
			margin-top: 15px;
			border-top: 1px solid #e7e0d5;
		}
		.row {
			display: grid;
			grid-template-columns: minmax(150px, 220px) 1fr minmax(88px, auto);
			gap: 18px;
			align-items: center;
			min-height: 86px;
			border-bottom: 1px solid #e7e0d5;
		}
		.file-label {
			font-size: 15px;
			font-weight: 650;
			overflow-wrap: anywhere;
		}
		.run-count {
			color: #626b78;
			font-size: 12px;
			margin-top: 4px;
		}
		.bar-area {
			position: relative;
			height: 66px;
			background:
				linear-gradient(to right, transparent calc(50% - 1px), #8a929d calc(50% - 1px), #8a929d calc(50% + 1px), transparent calc(50% + 1px)),
				repeating-linear-gradient(to right, #ebe5db 0, #ebe5db 1px, transparent 1px, transparent 12.5%);
			border-radius: 4px;
		}
		.bar {
			position: absolute;
			height: 8px;
			border-radius: 999px;
			top: var(--top);
			left: var(--left);
			width: var(--width);
			background: var(--color);
			box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.09);
		}
		.value {
			position: absolute;
			top: calc(var(--top) - 6px);
			left: var(--value-left);
			transform: var(--value-transform);
			font-size: 12px;
			font-weight: 680;
			color: #313842;
			white-space: nowrap;
		}
		.validity {
			font-size: 12px;
			color: #626b78;
			text-align: right;
			line-height: 1.45;
		}
		.validity strong {
			color: #2f6f3f;
		}
		.validity .warn {
			color: #9a3412;
			font-weight: 700;
		}
		.empty-state {
			color: #626b78;
			padding: 18px 0 4px;
		}
		@media (max-width: 840px) {
			main {
				width: min(100vw - 28px, 1250px);
				padding-top: 24px;
			}
			header, .group-head, .row {
				grid-template-columns: 1fr;
			}
			.summary {
				justify-content: flex-start;
			}
			.overall {
				grid-template-columns: repeat(2, minmax(0, 1fr));
				min-width: 0;
			}
			.validity {
				text-align: left;
			}
		}
	</style>
</head>
<body>
	<main>
		<header>
			<div>
				<h1>Refactoring Experiment Report</h1>
				<p class="meta">Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())}</p>
			</div>
			<div class="summary">
				<span class="pill">${report.baselines.length} baseline files</span>
				<span class="pill">${report.groups.length} test groups</span>
				<span class="pill">Scale +/-${formatPct(maxAbs)}</span>
			</div>
		</header>
		<div class="legend">
			${METRIC_KEYS.map((metric) => `<span class="legend-item"><span class="swatch" style="background:${METRIC_COLORS[metric]}"></span>${escapeHtml(METRIC_LABELS[metric])}</span>`).join('\n\t\t\t')}
		</div>
		${report.groups.map((group) => renderGroup(group, maxAbs)).join('\n')}
	</main>
</body>
</html>
`;
}

function renderGroup(group: GroupReport, maxAbs: number) {
	return /*html*/ `<section>
	<div class="group-head">
		<div>
			<h2>${escapeHtml(group.name)}</h2>
			<p class="meta">${group.validRunCount}/${group.totalRunCount} valid runs</p>
		</div>
		<div class="overall">
			${METRIC_KEYS.map((metric) => `<div class="overall-item" style="border-color: ${METRIC_COLORS[metric]}">
				<div class="overall-label">${escapeHtml(METRIC_LABELS[metric])}</div>
				<div class="overall-value">${formatPct(group.overallAverageImprovementPct[metric])}</div>
			</div>`).join('\n\t\t\t')}
		</div>
	</div>
	<div class="chart">
		${group.files.length ? group.files.map((file) => renderFileSummary(file, maxAbs)).join('\n') : '<p class="empty-state">No matching refactor files found.</p>'}
	</div>
</section>`;
}

function renderFileSummary(file: FileSummary, maxAbs: number) {
	const validity = file.validRunCount == file.totalRunCount && file.totalRunCount > 0
		? '<strong>valid</strong>'
		: `<span class="warn">${file.validRunCount}/${file.totalRunCount} valid</span>`;

	return /*html*/ `<div class="row">
	<div>
		<div class="file-label">${escapeHtml(file.baseFile)}</div>
		<div class="run-count">${file.totalRunCount} run${file.totalRunCount == 1 ? '' : 's'}</div>
	</div>
	<div class="bar-area" aria-label="${escapeHtml(file.baseFile)} improvement chart">
		${METRIC_KEYS.map((metric, index) => renderBar(metric, file.averageImprovementPct[metric], index, maxAbs)).join('\n\t\t')}
	</div>
	<div class="validity">${validity}</div>
</div>`;
}

function renderBar(metric: MetricKey, value: number | null, index: number, maxAbs: number) {
	if (value == null)
		return '';

	const clamped = Math.max(-maxAbs, Math.min(maxAbs, value));
	const width = Math.abs(clamped) / maxAbs * 50;
	const left = clamped >= 0 ? 50 : 50 - width;
	const valueLeft = clamped >= 0 ? Math.min(98, 50 + width + 1.6) : Math.max(2, 50 - width - 1.6);
	const valueTransform = clamped >= 0 ? 'translateX(0)' : 'translateX(-100%)';
	const top = 9 + index * 14;

	return /*html*/ `<span class="bar" title="${escapeHtml(METRIC_LABELS[metric])}: ${formatPct(value)}" style="--top:${top}px;--left:${left}%;--width:${width}%;--color:${METRIC_COLORS[metric]}"></span>
		<span class="value" style="--top:${top}px;--value-left:${valueLeft}%;--value-transform:${valueTransform}">${formatPct(value)}</span>`;
}

function getReportScale(report: ExperimentReport) {
	const values = report.groups.flatMap((group) => group.files.flatMap((file) => METRIC_KEYS.map((metric) => file.averageImprovementPct[metric])))
		.filter((value): value is number => typeof value == 'number' && Number.isFinite(value))
		.map((value) => Math.abs(value));
	const max = Math.max(25, ...values);
	return Math.min(200, Math.ceil(max / 25) * 25);
}

function formatPct(value: number | null) {
	if (value == null || !Number.isFinite(value))
		return 'N/A';

	return `${value.toFixed(1)}%`;
}

function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
