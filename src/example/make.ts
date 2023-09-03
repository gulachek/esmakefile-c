import { cli } from 'gulpachek';
import { C } from '../index.js';

cli((book, opts) => {
	const c = new C({
		...opts,
		book,
		cVersion: 'C17',
	});

	c.addExecutable({
		output: 'hello',
		src: ['src/hello.c', 'src/foo.c'],
		definitions: {
			FOO_RETURN: '4',
		},
	});
});
