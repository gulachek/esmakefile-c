import { ICCompiler } from './Compiler.js';
import { AppleClang } from './AppleClang.js';

export function platformCompiler(): AppleClang {
	return new AppleClang();
}
