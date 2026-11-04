import config from "../../vitest.config.ts";
export default {
	...config,
	test: {
		...config.test,
		projects: config
			.test!.projects!.filter(
				(project: any) => project.test?.name === "browser",
			)
			.map((project: any) => ({
				...project,
				test: {
					...project.test,
					browser: {
						...project.test.browser,
						instances: [{ browser: "chromium" }],
					},
				},
			})),
	},
};
