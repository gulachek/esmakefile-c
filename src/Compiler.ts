import { Cookbook, IBuildPath, Path } from 'esmakefile';

export type CVersion = 'C89' | 'C99' | 'C11' | 'C17';
export type CxxVersion =
	| 'C++98'
	| 'C++03'
	| 'C++11'
	| 'C++14'
	| 'C++17'
	| 'C++20';

export type RuntimeLanguage = 'C' | 'C++';

export type Linkable = string | IBuildPath;

export interface ICTranslationUnit {
	src: Path;
	cVersion: CVersion;
	includePaths: Set<string>;
	definitions: Record<string, string>;
}

export interface ICxxTranslationUnit {
	src: Path;
	cxxVersion: CxxVersion;
	includePaths: Set<string>;
	definitions: Record<string, string>;
}

export type TranslationUnit = ICTranslationUnit | ICxxTranslationUnit;

export function isC(tu: TranslationUnit): tu is ICTranslationUnit {
	return 'cVersion' in tu;
}

/**
 * C compiler for building C libraries
 * and executables
 */
export interface ICompiler<TLibraryOpts extends ILibraryOpts = ILibraryOpts> {
	/** Compile and link an executable */
	addExecutable(book: Cookbook, opts: IExecutableOpts): void;

	/** Compile and (optionally) link a library */
	addLibrary(book: Cookbook, opts: TLibraryOpts): IBuildPath;

	addCompileCommands(book: Cookbook): void;
}

export interface IExecutableOpts {
	output: IBuildPath;
	src: TranslationUnit[];
	link: Linkable[];
	runtime: RuntimeLanguage;
}

export interface ILibraryOpts {
	name: string;
	version: string;
	outputDirectory: IBuildPath;
	src: TranslationUnit[];
	link: Linkable[];
	runtime: RuntimeLanguage;

	// API
	includePaths: Set<string>;
	cVersion: CVersion;
	definitions: Record<string, string>;
}

export interface ICLibraryInterface {
	/**  paths for consumer to include */
	includePaths: Set<string>;

	/** definitions for consumer to define */
	definitions: Record<string, string>;

	/** C version that consumer must be compatible with to include headers */
	cVersion: CVersion;
}
