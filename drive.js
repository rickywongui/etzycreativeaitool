
import "dotenv/config";
import { google } from "googleapis";
import fs from "fs";

console.log("Drive CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT = "http://localhost:3000/auth/google/callback";

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT
);

let drive = null;

export function getAuthUrl() {
    return oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/drive"]
    });
}

export async function handleOAuthCallback(code) {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    drive = google.drive({ version: "v3", auth: oauth2Client });
}

export async function createDriveFolder(name, parentId = null) {
    if (!drive) throw new Error("Drive not authenticated");

    const res = await drive.files.create({
        requestBody: {
            name,
            mimeType: "application/vnd.google-apps.folder",
            parents: parentId ? [parentId] : []
        }
    });

    return res.data.id;
}

export async function uploadToDrive(filePath, fileName, folderId) {
    if (!drive) throw new Error("Drive not authenticated");

    const res = await drive.files.create({
        requestBody: {
            name: fileName,
            parents: [folderId]
        },
        media: {
            body: fs.createReadStream(filePath)
        }
    });

    const fileId = res.data.id;

    await drive.permissions.create({
        fileId,
        requestBody: {
            role: "reader",
            type: "anyone"
        }
    });

    return {
        fileId,
        download: `https://drive.google.com/uc?id=${fileId}&export=download`,
        view: `https://drive.google.com/file/d/${fileId}/view`
    };
}

export function isDriveReady() {
    return !!drive;
}


export async function findFolderByName(name, parentId) {
    const res = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`,
        fields: "files(id, name)"
    });

    return res.data.files[0] || null;
}
