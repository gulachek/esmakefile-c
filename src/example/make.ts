import { cli, Path } from 'iheartmake';
import { C, platformCompiler } from '../index.js';

cli((book, opts) => {
	const c = new C(platformCompiler(), {
		...opts,
		book,
		cVersion: 'C17',
	});

	book.add('all', [Path.build('hello'), Path.build('compile_commands.json')]);

	const lib = c.addLibrary({
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
		name: 'hello',
		src: ['src/hello.c'],
		link: [lib, 'zlib', 'sqlite3', 'core-graphics'],
	});

	c.addCompileCommands();
});
