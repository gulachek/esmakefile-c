import { parsePrereqs } from '../makeDepfile.js';
import { expect } from 'chai';

describe('parsePrereqs', () => {
	it('reads multiple lines split by escaped line', () => {
		const deps = parsePrereqs(`src/hello.o: \
  src/hello.c \
  foo/include/foo.h \
  foo/include/foo_api.h
`);

		expect(deps).to.deep.equal([
			'src/hello.c',
			'foo/include/foo.h',
			'foo/include/foo_api.h',
		]);
	});

	it('reads multiple prereqs on the same physical line', () => {
		const deps = parsePrereqs('foo: bar baz');
		expect(deps).to.deep.equal(['bar', 'baz']);
	});

	it('reads multiple physical lines with multiple prereqs', () => {
		const deps = parsePrereqs(`foo: bar baz\
																		qux fizz \
																		buzz`);

		expect(deps).to.deep.equal(['bar', 'baz', 'qux', 'fizz', 'buzz']);
	});
});
