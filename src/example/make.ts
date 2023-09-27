import { cli } from 'gulpachek';
import { C, platformCompiler } from '../index.js';

cli((book, opts) => {
	const c = new C(platformCompiler(), {
		...opts,
		book,
		cVersion: 'C17',
	});

	const foo = c.addLibrary({
		name: 'foo',
		version: '1.0.0',
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
		link: [foo, 'zlib', 'sqlite3', 'core-graphics'],
	});
});
