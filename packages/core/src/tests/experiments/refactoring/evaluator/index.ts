import path from 'node:path';

import { buildReport, REPORT_HTML, REPORT_JSON } from './evaluator';
import { writeReportHtml, writeReportJson } from './report';

export function main() {
	const report = buildReport();
	writeReportJson(report, REPORT_JSON);
	writeReportHtml(report, REPORT_HTML);

	console.log(`Wrote ${path.relative(process.cwd(), REPORT_JSON)}`);
	console.log(`Wrote ${path.relative(process.cwd(), REPORT_HTML)}`);
}

main();