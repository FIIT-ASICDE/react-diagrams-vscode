declare module 'elkjs/lib/elk.bundled.js' {
	import ELK from 'elkjs/lib/elk-api';
	import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';

	export default ELK;
	export type { ElkExtendedEdge, ElkNode };
}