import { platformCompiler, AppleClang } from '../index.js';
import { expect } from 'chai';
import { platform } from 'node:os';

const isMac = platform() === 'darwin';

describe('platformCompiler', () => {
	it('uses AppleClang by default when on mac', () => {
		const compiler = platformCompiler();
		const isAppleClang = compiler instanceof AppleClang;
		expect(isAppleClang).to.equal(isMac);
	});
});
