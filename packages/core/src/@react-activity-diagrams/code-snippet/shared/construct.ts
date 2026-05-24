
export type Construct =
	
	
	| 'if'
	
	| 'switch'
	
	| 'try'

	
	| 'while'
	| 'do-while'
	
	| 'for'
	
	| 'for-of'
	
	| 'for-in'
	
	| 'foreach'

	
	
	| 'function'
	
	| 'hook'

	
	
	| 'return'
	| 'throw'
	| 'break'
	| 'continue'
	
	| 'pending-return'
	
	| 'unknown';


export const DECISION_CONSTRUCTS = ['if', 'switch'] as const;


export const LOOP_CONSTRUCTS = [
	'while',
	'do-while',
	'for',
	'for-of',
	'for-in',
	'foreach',
] as const;


export const EXPANDABLE_CONSTRUCTS = ['function', 'hook'] as const;


export const TERMINATOR_CONSTRUCTS = ['return', 'throw', 'break', 'continue'] as const;

const DECISION_CONSTRUCT_SET = new Set<string>(DECISION_CONSTRUCTS);
const LOOP_CONSTRUCT_SET = new Set<string>(LOOP_CONSTRUCTS);
const TERMINATOR_CONSTRUCT_SET = new Set<string>(TERMINATOR_CONSTRUCTS);


// Checks whether is decision construct.
export function isDecisionConstruct(construct: string): construct is (typeof DECISION_CONSTRUCTS)[number] {
	return DECISION_CONSTRUCT_SET.has(construct);
}


// Checks whether is loop construct.
export function isLoopConstruct(construct: string): construct is (typeof LOOP_CONSTRUCTS)[number] {
	return LOOP_CONSTRUCT_SET.has(construct);
}


// Checks whether is terminator construct.
export function isTerminatorConstruct(
	construct: string,
): construct is (typeof TERMINATOR_CONSTRUCTS)[number] {
	return TERMINATOR_CONSTRUCT_SET.has(construct);
}



// Returns default construct for node type.
export function getDefaultConstructForNodeType(
	nodeType: string,
	fallbackForOther: Construct | 'action' = 'unknown',
): Construct | 'action' {
	switch (nodeType) {
		case 'decision':
			return 'if';
		case 'loop':
			return 'while';
		case 'expandable':
			return 'function';
		default:
			return fallbackForOther;
	}
}