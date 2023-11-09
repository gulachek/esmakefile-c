import { cli } from 'esmakefile';
import { C, platformCompiler } from '../index.js';

cli((book, opts) => {
	const compiler = platformCompiler();

	const c = new C(compiler, {
		...opts,
		book,
		cVersion: 'C17',
		cxxVersion: 'C++20',
	});

	book.add('all', []);

	const lib = c.addLibrary({
		name: 'foo',
		version: '1.0.0',
		outputDirectory: 'foolib',
		definitions: {
			FOO_TEST_MACRO: '4',
		},
		privateDefinitions: {
			EXPORT_FOO_API: '',
		},
		precompiledHeader: 'foo/include/pch.hpp',
		includePaths: ['foo/include'],
		privateIncludes: ['foo/private'],
		src: ['foo/foo.cpp', 'foo/bar.cpp'],
	});

	const hello = c.addExecutable({
		name: 'hello',
		src: ['src/hello.c'],
		link: [lib, 'zlib', 'sqlite3', 'core-graphics'],
	});

	const compileCommands = c.addCompileCommands();

	book.add('all', [hello, compileCommands]);
});
