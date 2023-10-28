import { cli, Path } from 'esmakefile';
import { C, platformCompiler } from '../index.js';

cli((book, opts) => {
	const compiler = platformCompiler();

	const c = new C(compiler, {
		...opts,
		book,
		cVersion: 'C17',
		cxxVersion: 'C++20',
	});

	book.add('all', [Path.build('hello'), Path.build('compile_commands.json')]);

	const lib = c.addLibrary({
		name: 'foo',
		version: '1.0.0',
		outputDirectory: 'foolib',
		definitions: {
			EXPORT_FOO_API: '',
		},
		includePaths: ['foo/include'],
		src: ['foo/foo.c', 'foo/bar.cpp'],
	});

	c.addExecutable({
		name: 'hello',
		src: ['src/hello.c'],
		link: [lib, 'zlib', 'sqlite3', 'core-graphics'],
	});

	c.addCompileCommands();
});
