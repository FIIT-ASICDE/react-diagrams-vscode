export type Message<T = any> = {
	type: string;
	data?: T;
};