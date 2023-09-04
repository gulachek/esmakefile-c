import { cli } from 'gulpachek';
import { C, platformCompiler } from '../index.js';

cli((book, opts) => {
	const c = new C(platformCompiler(), {
		...opts,
		book,
		cVersion: 'C17',
	});

	// how to find zlib?
	// when building from source, should find source library of zlib
	//
	const foo = c.addLibrary({
		name: 'foo',
		outputDirectory: 'foolib',
		definitions: {
			FOO_RETURN: '4',
		},
		includePaths: ['foo/include'],
		src: ['foo/foo.c'],
	});

	c.addExecutable({
		output: 'hello',
		src: ['src/hello.c'],
		definitions: {
			FOO_RETURN: '4',
		},
		link: [foo],
	});
});
