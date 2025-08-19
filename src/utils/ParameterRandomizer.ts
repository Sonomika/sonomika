// src/utils/ParameterRandomizer.ts

export type EffectParamDef = {
	name: string;
	type: string;
	value?: any;
	min?: number;
	max?: number;
	step?: number;
	options?: any[];
	lockDefault?: boolean;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function snapToStep(value: number, min: number, max: number, step?: number): number {
	if (!step || step <= 0) return value;
	const snapped = Math.round((value - min) / step) * step + min;
	return clamp(snapped, min, max);
}

function randomInRange(min: number, max: number, step?: number): number {
	const r = Math.random() * (max - min) + min;
	return snapToStep(r, min, max, step);
}

function randomHexColor(): string {
	return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
}

function pickRandom<T>(arr: T[]): T | undefined {
	if (!arr || arr.length === 0) return undefined;
	return arr[Math.floor(Math.random() * arr.length)];
}

export function randomizeEffectParams(
	metadataParams: EffectParamDef[] = [],
	currentParams?: Record<string, { value: any } | any>
): Record<string, { value: any }> {
	const result: Record<string, { value: any }> = {};

	for (const param of metadataParams) {
		// Never randomize default-locked params
		if ((param as any).lockDefault) continue;
		const { name, type } = param;
		let newValue: any;

		if (type === 'number') {
			const min = typeof param.min === 'number' ? param.min : 0;
			const max = typeof param.max === 'number' ? param.max : 1;
			newValue = randomInRange(min, max, param.step);
		} else if (type === 'boolean') {
			newValue = Math.random() < 0.5;
		} else if (type === 'select') {
			const opts = Array.isArray(param.options) ? param.options : [];
			if (opts.length > 0) {
				const pick = pickRandom(opts);
				newValue = typeof pick === 'string' ? pick : (pick?.value ?? pick);
			}
		} else if (type === 'color') {
			newValue = randomHexColor();
		} else if (type === 'numberArray') {
			const base = Array.isArray(param.value) ? param.value : Array.isArray((currentParams as any)?.[name]?.value) ? (currentParams as any)[name].value : [0, 1, 2];
			const min = typeof param.min === 'number' ? param.min : 0;
			const max = typeof param.max === 'number' ? param.max : 1;
			newValue = base.map(() => randomInRange(min, max, param.step));
		} else if (type === 'colorArray') {
			const base = Array.isArray(param.value) ? param.value : Array.isArray((currentParams as any)?.[name]?.value) ? (currentParams as any)[name].value : ['#ff0000', '#00ff00', '#0000ff'];
			newValue = base.map(() => randomHexColor());
		} else if (type === 'vector2') {
			newValue = [Math.random(), Math.random()];
		} else if (type === 'vector3') {
			newValue = [Math.random(), Math.random(), Math.random()];
		} else {
			continue;
		}

		if (newValue !== undefined) {
			result[name] = { value: newValue };
		}
	}

	return result;
}
