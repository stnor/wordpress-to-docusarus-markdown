const { format } = require("date-fns");
const fetch = require("node-fetch");
const path = require("path");

const xml2js = require("xml2js");
const fs = require("fs");
const util = require("util");
const slugify = require("slugify");
const htmlentities = require("he");

const unified = require("unified");
const parseHTML = require("rehype-parse");
const rehype2remark = require("rehype-remark");
const stringify = require("remark-stringify");
const imageType = require("image-type");

processExport();

function processExport() {
    var parser = new xml2js.Parser();
    fs.readFile("export.xml", function(err, data) {
        if (err) {
            console.log("Error: " + err);
        }

        parser.parseString(data, function(err, result) {
            if (err) {
                console.log("Error parsing xml: " + err);
            }
            console.log("Parsed XML");

            const posts = result.rss.channel[0].item;

            fs.mkdir("out", function() {
                posts
                    .filter(p => p["wp:post_type"][0] === "post")
                    .forEach(processPost);
            });
        });
    });
}

function constructImageName({ urlParts, buffer }) {
    const pathParts = path.parse(urlParts.pathname);
    const { ext } = imageType(new Buffer(buffer));

    return `${pathParts.name}.${ext}`;
}

async function processImage({ url, postData, images, directory }) {
    const cleanUrl = htmlentities.decode(url);
    const urlParts = new URL(cleanUrl);

    const filePath = `out/${directory}/img`;

    try {
        const response = await downloadFile(cleanUrl);
        const type = response.headers.get("Content-Type");

        if (type.includes("image") || type.includes("octet-stream")) {
            const buffer = await response.arrayBuffer();
            const imageName = constructImageName({
                urlParts,
                buffer
            });

            //Make the image name local relative in the markdown
            postData = postData.replace(url, `./img/${imageName}`);
            images = [...images, `./img/${imageName}`];

            fs.writeFileSync(`${filePath}/${imageName}`, new Buffer(buffer));
        } else {
            throw new Error("Not an image", url);
        }
    } catch (e) {
        console.log(`Keeping ref to ${url}`);
        console.log(e);
    }

    return [postData, images];
}

async function processImages({ postData, directory }) {
    const patt = new RegExp('(?:src="(.*?)")', "gi");
    let images = [];

    var m;
    let matches = [];

    while ((m = patt.exec(postData)) !== null) {
        matches.push(m[1]);
    }

    if (matches != null && matches.length > 0) {
        for (let match of matches) {
            console.log({ match });
            [postData, images] = await processImage({
                url: match,
                postData,
                images,
                directory
            });
        }
    }

    return [postData, images];
}

async function processPost(post) {
    console.log("Processing Post");

    var postTitle = typeof post.title === "string" ? post.title : post.title[0];
    console.log("Post title: " + postTitle);
    var postDate = new Date(post.pubDate);
    console.log("Post Date: " + postDate);
    var postData = post["content:encoded"][0];
    console.log("Post length: " + postData.length + " bytes");
    const slug = slugify(postTitle, {
        remove: /[^\w\s]/g
    }).toLowerCase();
    console.log("Post slug: " + slug);

    const heroURLs = post["wp:postmeta"]
        .filter(
            meta =>
                meta["wp:meta_key"][0].includes("opengraph-image") ||
                meta["wp:meta_key"][0].includes("twitter-image")
        )
        .map(meta => meta["wp:meta_value"][0])
        .filter(url => url.startsWith("http"));

    let heroImage = "";

    try {
        format(postDate, "yyyy-MM-dd");
    } catch (e) {
        console.log("INAVLID TIME", postDate);
    }

    let directory = `${format(postDate, "yyyy-MM-dd")}-${slug}`;
    let fname = `index.mdx`;

    try {
        fs.mkdirSync(`out/${directory}`);
        fs.mkdirSync(`out/${directory}/img`);
    } catch (e) {
        directory = directory + "-2";
        fs.mkdirSync(`out/${directory}`);
        fs.mkdirSync(`out/${directory}/img`);
    }

    //Merge categories and tags into tags
    const categories =
        post.category &&
        post.category
            .map(cat => cat["_"])
            .filter(cat => cat === "Uncategorized");

    //Find all images
    let images = [];
    [postData, images] = await processImages({ postData, directory });

    if (heroURLs.length > 0) {
        const url = heroURLs[0];
        [postData, images] = await processImage({
            url,
            postData,
            images,
            directory
        });
        heroImage = images[images.length - 1];
    } else {
        heroImage = images[0];
    }

    const markdown = await new Promise((resolve, reject) => {
        unified()
            .use(parseHTML, {
                emitParseErrors: true,
                duplicateAttribute: false
            })
            .use(rehype2remark)
            .use(stringify)
            .process(postData, (err, markdown) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(markdown.contents.trim());
                }
            });
    });

    try {
        postTitle.replace("\\", "\\\\").replace(/"/g, '\\"');
    } catch (e) {
        console.log("FAILED REPLACE", postTitle);
    }

    let header = [
        "---",
        "layout: post",
        `title: '${postTitle.replace(/'/g, "''")}'`,
        `date: ${format(postDate, "yyyy-MM-dd")}`
    ];

    if (categories && categories.length > 0) {
        header.push(`categories: '${categories.join(", ")}'`);
    }

    header.push("author: Swizec Teller");
    header.push(`hero: ${heroImage}`);
    header.push("---");
    header.push("");

    fs.writeFile(
        `out/${directory}/${fname}`,
        header.join("\n") + markdown,
        function(err) {}
    );
}

async function downloadFile(url) {
    const response = await fetch(url);
    if (response.status >= 400) {
        throw new Error("Bad response from server");
    } else {
        return response;
    }
}
function getPaddedMonthNumber(month) {
    if (month < 10) return "0" + month;
    else return month;
}

function getPaddedDayNumber(day) {
    if (day < 10) return "0" + day;
    else return day;
}
