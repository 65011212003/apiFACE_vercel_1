import express, { Request, Response } from 'express';
import mysql, { Connection } from 'mysql';
import bcrypt from 'bcrypt';
import cors from 'cors';
import multer, { Multer } from "multer";
import path from 'path';
import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { promisify } from 'util';

const app = express();

// app.use(
//     cors({
//         origin: "*",
//     })
// );


app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Create a MySQL connection pool
const db = mysql.createPool({
    host: '202.28.34.197',
    user: 'web66_65011212003',
    password: '65011212003@csmsu',
    database: 'web66_65011212003',
});

// Middleware to parse JSON in the request body
app.use(express.json());

// Endpoint to get all users
app.get('/users', (req: Request, res: Response) => {
    const query = 'SELECT * FROM Users';

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        res.json(results);
    });
});

// Endpoint to get a specific user by ID
app.get('/users/:id', (req: Request, res: Response) => {
    const userId = req.params.id;
    const query = 'SELECT * FROM Users WHERE UserID = ?';

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(results[0]);
    });
});

app.post('/register', async (req: Request, res: Response) => {
    const { display_name, username, password } = req.body;

    // Check if the username already exists
    const checkUsernameQuery = 'SELECT * FROM Users WHERE Username = ?';

    db.query(checkUsernameQuery, [username], async (checkErr, checkResults) => {
        if (checkErr) {
            console.error(checkErr);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        // If the username already exists, return an error
        if (checkResults.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the user into the database
        const insertUserQuery = 'INSERT INTO Users (display_name , Username, Password) VALUES (?, ?, ?)';

        db.query(insertUserQuery, [display_name, username, hashedPassword], (insertErr, results) => {
            if (insertErr) {
                console.error(insertErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            res.json({ userId: results.insertId, message: 'User created successfully' });
        });
    });
});



// Endpoint for user login
app.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    // Check if username and password are provided
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if the user exists in the database
    const query = 'SELECT * FROM Users WHERE Username = ?';

    db.query(query, [username], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Compare the provided password with the hashed password from the database
        const user = results[0];
        bcrypt.compare(password, user.Password, (bcryptErr, bcryptResult) => {
            if (bcryptErr) {
                console.error(bcryptErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            if (!bcryptResult) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            // Passwords match, user is authenticated
            res.json({ userId: user.UserID, message: 'Login successful' });
        });
    });
});

//     const query = 'SELECT * FROM Images WHERE EloScore BETWEEN (1500 - 300) AND (1500 + 300) ORDER BY RAND() LIMIT 2';

//     db.query(query, (err, results) => {
//         if (err) {
//             console.error(err);
//             return res.status(500).json({ error: 'Internal Server Error' });
//         }

//         res.json(results);
//     });
// });


//     const eloRange = 300;

//     const query = `
//       SELECT I.*, U.display_name
//       FROM Images I
//       JOIN Users U ON I.UserID = U.UserID
//       WHERE I.EloScore BETWEEN ? AND ?
//         AND U.UserID != I.UserID
//       ORDER BY RAND()
//       LIMIT 2
//     `;

//     const eloMin = 1500 - eloRange;
//     const eloMax = 1500 + eloRange;

//     db.query(query, [eloMin, eloMax], (err, results) => {
//         if (err) {
//             console.error(err);
//             return res.status(500).json({ error: 'Internal Server Error' });
//         }

//         res.json(results);
//     });
// });

// app.get('/randomImages', (req: Request, res: Response) => {

//     const subquery = `
//         SELECT MAX(ImageID) AS ImageID
//         FROM Images
//         WHERE EloScore BETWEEN (1500 - 300) AND (1500 + 300)
//         GROUP BY UserID
//         ORDER BY RAND()
//         LIMIT 2
//     `;

//     const query = `
//         SELECT i.*
//         FROM Images i
//         JOIN (${subquery}) sub ON i.ImageID = sub.ImageID
//         WHERE i.EloScore BETWEEN (1500 - 300) AND (1500 + 300)
//     `;

//     db.query(query, (err, results) => {
//         if (err) {
//             console.error(err);
//             return res.status(500).json({ error: 'Internal Server Error' });
//         }

//         res.json(results);
//     });
// });


app.get('/randomImages', (req: Request, res: Response) => {
    const eloRange = 300;

    // Query to select random images from two different users within the EloScore range
    const query = `
        SELECT *
        FROM Images
        WHERE EloScore BETWEEN (1500 - ${eloRange}) AND (1500 + ${eloRange})
        ORDER BY RAND()
        LIMIT 4
    `;

    // Execute the query
    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        // Ensure that we have at least two different users' images
        const uniqueUsers = new Set<number>();
        const selectedImages: any[] = [];

        for (const image of results) {
            if (!uniqueUsers.has(image.UserID)) {
                uniqueUsers.add(image.UserID);
                selectedImages.push(image);
            }

            if (selectedImages.length >= 2) {
                break;  // Stop once we have images from two different users
            }
        }

        // Send the JSON response with the selected images
        res.json(selectedImages);
    });
});



interface Image {
    ImageID: number;
    EloScore: number;
    // Add other properties as needed
}


const cooldownMap = new Map<number, number>();

app.post('/vote', (req, res) => {
    const { VoterID, WinImageID, LoseImageID } = req.body;

    // Check if cooldown is active for either WinImageID or LoseImageID
    if (
        (cooldownMap.has(WinImageID) && Date.now() - cooldownMap.get(WinImageID)! < 5000) ||
        (cooldownMap.has(LoseImageID) && Date.now() - cooldownMap.get(LoseImageID)! < 5000)
    ) {
        res.status(403).send('Cooldown active. Cannot vote for the same ImageID within 5 seconds.');
        return;
    }

    // Acquire a connection from the pool
    db.getConnection((getConnectionError, connection) => {
        if (getConnectionError) {
            console.error('Error acquiring connection from the pool:', getConnectionError);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Insert the vote into the Votes table
        const voteQuery = `INSERT INTO Votes (VoterID, WinImageID, LoseImageID) VALUES (?, ?, ?)`;
        connection.query(voteQuery, [VoterID, WinImageID, LoseImageID], (voteError, voteResults) => {
            if (voteError) {
                connection.release(); // Release the connection back to the pool
                console.error('Error inserting vote into Votes table:', voteError);
                res.status(500).send('Internal Server Error');
            } else {
                // Update EloScores in the Images table
                updateEloScores(connection, WinImageID, LoseImageID, () => {
                    connection.release(); // Release the connection back to the pool
                    res.status(200).json({ message: 'Vote successfully recorded' });

                    // Set the cooldown timestamp for both WinImageID and LoseImageID
                    cooldownMap.set(WinImageID, Date.now());
                    cooldownMap.set(LoseImageID, Date.now());
                });
            }
        });
    });
});

function updateEloScores(connection: mysql.PoolConnection, winImageID: any, loseImageID: any, callback: { (): void; (): void; }) {
    // Retrieve EloScores for the two images
    const getEloQuery = 'SELECT EloScore FROM Images WHERE ImageID IN (?, ?)';
    connection.query(getEloQuery, [winImageID, loseImageID], (eloError, eloResults) => {
        if (eloError) {
            console.error('Error retrieving EloScores:', eloError);
            callback();
        } else {
            const [winElo, loseElo] = eloResults.map((result: { EloScore: any; }) => result.EloScore);

            // Apply Elo Rating algorithm
            const kFactor = 32; // Adjust the k-factor based on your requirements
            const expectedWin = 1 / (1 + 10 ** ((loseElo - winElo) / 400));
            const expectedLose = 1 - expectedWin;

            const newWinElo = winElo + kFactor * (1 - expectedWin);
            const newLoseElo = loseElo + kFactor * (0 - expectedLose);

            // Update EloScores in the Images table
            const updateEloQuery = 'UPDATE Images SET EloScore = ? WHERE ImageID = ?';
            connection.query(updateEloQuery, [newWinElo, winImageID], (updateError) => {
                if (updateError) {
                    console.error('Error updating EloScore for the winning image:', updateError);
                }

                // Update EloScore for the losing image
                connection.query(updateEloQuery, [newLoseElo, loseImageID], (updateError) => {
                    if (updateError) {
                        console.error('Error updating EloScore for the losing image:', updateError);
                    }

                    callback();
                });
            });
        }
    });
}


// Endpoint for updating user password
app.put('/updatePassword/:id', async (req: Request, res: Response) => {
    const userId = parseInt(req.params.id);
    const { oldPassword, newPassword } = req.body;

    // Check if the required fields are present
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Old password and new password are required' });
    }

    // Fetch the user from the database
    const getUserQuery = 'SELECT * FROM Users WHERE UserID = ?';
    db.query(getUserQuery, [userId], async (getUserErr, userResults) => {
        if (getUserErr) {
            console.error(getUserErr);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (userResults.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResults[0];

        // Compare the old password with the hashed password from the database
        const isOldPasswordValid = await bcrypt.compare(oldPassword, user.Password);

        if (!isOldPasswordValid) {
            return res.status(401).json({ error: 'Incorrect old password' });
        }

        // Hash the new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update the user's password in the database
        const updatePasswordQuery = 'UPDATE Users SET Password = ? WHERE UserID = ?';
        db.query(updatePasswordQuery, [hashedNewPassword, userId], (updateErr, updateResult) => {
            if (updateErr) {
                console.error(updateErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            res.json({ message: 'Password updated successfully' });
        });
    });
});


// function calculateElo(winnerImageID, loserImageID) {
//     const kFactor = 32; // Adjust the k-factor based on your requirements

//     // Retrieve current Elo scores
//     const getScoresQuery = 'SELECT EloScore FROM Images WHERE ImageID IN (?, ?)';
//     db.query(getScoresQuery, [winnerImageID, loserImageID], (error, results) => {
//         if (error) {
//             console.error(error);
//         } else if (results.length === 2) {
//             const winnerElo = results.find((result) => result.ImageID === winnerImageID).EloScore;
//             const loserElo = results.find((result) => result.ImageID === loserImageID).EloScore;

//             // Calculate expected outcomes
//             const expectedWinner = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
//             const expectedLoser = 1 / (1 + 10 ** ((winnerElo - loserElo) / 400));

//             // Update Elo scores
//             const newWinnerElo = winnerElo + kFactor * (1 - expectedWinner);
//             const newLoserElo = loserElo + kFactor * (0 - expectedLoser);

//             // Update Elo scores in the Images table
//             const updateScoresQuery = 'UPDATE Images SET EloScore = ? WHERE ImageID = ?';
//             db.query(updateScoresQuery, [newWinnerElo, winnerImageID], (updateError) => {
//                 if (updateError) {
//                     console.error(updateError);
//                 }
//             });

//             db.query(updateScoresQuery, [newLoserElo, loserImageID], (updateError) => {
//                 if (updateError) {
//                     console.error(updateError);
//                 }
//             });
//         }
//     });
// }





// Update user information endpoint

app.put('/updateUserInfo/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    const { display_name, Username, Password, Bio } = req.body;

    // Check if the required fields are present
    if (!display_name && !Username && !Password && !Bio) {
        return res.status(400).json({ error: 'At least one field (Display name , Username, Password, Bio) is required for update' });
    }

    // Hash the password before storing it
    let hashedPassword;
    if (Password) {
        try {
            hashedPassword = await bcrypt.hash(Password, 10);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Error hashing the password' });
        }
    }

    // Construct the SQL query to update the user
    let updateQuery = 'UPDATE Users SET ';
    const values = [];

    if (display_name) {
        updateQuery += 'display_name=?, ';
        values.push(display_name);
    }

    if (Username) {
        updateQuery += 'Username=?, ';
        values.push(Username);
    }

    if (hashedPassword) {
        updateQuery += 'Password=?, ';
        values.push(hashedPassword);
    }


    if (Bio) {
        updateQuery += 'Bio=?, ';
        values.push(Bio);
    }

    // Remove the trailing comma and complete the query
    updateQuery = updateQuery.slice(0, -2);
    updateQuery += ' WHERE UserID=?';
    values.push(userId);

    // Execute the update query
    db.query(updateQuery, values, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User updated successfully' });
    });
});


app.delete('/deleteUser/:id', (req, res) => {
    const userId = parseInt(req.params.id);

    // Construct the SQL query to delete the user
    const deleteQuery = 'DELETE FROM Users WHERE UserID=?';

    // Execute the delete query
    db.query(deleteQuery, [userId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    });
});



// app.get('/top-rated', (req, res) => {
//     // Construct the SQL query to get the top 10 rated images with display names and rank changes
//     const topRatedQuery = `
//         SELECT i.ImageID, i.ImageURL, i.EloScore, u.display_name, 
//             (ds.rank - (
//                 SELECT ds2.rank
//                 FROM DailyStatistics ds2
//                 WHERE ds2.image_id = ds.image_id AND ds2.Date = DATE_SUB(ds.Date, INTERVAL 1 DAY)
//                 ORDER BY ds2.Date DESC
//                 LIMIT 1
//             )) AS rank_change
//         FROM Images i
//         JOIN Users u ON i.UserID = u.UserID
//         JOIN DailyStatistics ds ON i.ImageID = ds.image_id AND ds.Date = (SELECT MAX(Date) FROM DailyStatistics WHERE image_id = i.ImageID)
//         ORDER BY i.EloScore DESC
//         LIMIT 10;
//     `;

//     // Execute the query
//     db.query(topRatedQuery, (err, results) => {
//         if (err) {
//             console.error(err);
//             return res.status(500).json({ error: 'Internal Server Error' });
//         }

//         res.json(results);
//     });
// });


// app.get('/top-rated', (req, res) => {
//     // Construct the SQL query to get the top 10 rated images with display names and rank changes
//     const topRatedQuery = `
//         SELECT i.ImageID, i.ImageURL, i.EloScore, u.display_name, 
//             CASE 
//                 WHEN ds.rank < prev_ds.rank THEN prev_ds.rank - ds.rank
//                 ELSE 0
//             END AS rank_up,
//             CASE 
//                 WHEN ds.rank > prev_ds.rank THEN ds.rank - prev_ds.rank
//                 ELSE 0
//             END AS rank_down
//         FROM Images i
//         JOIN Users u ON i.UserID = u.UserID
//         JOIN DailyStatistics ds ON i.ImageID = ds.image_id AND ds.Date = (SELECT MAX(Date) FROM DailyStatistics WHERE image_id = i.ImageID)
//         LEFT JOIN DailyStatistics prev_ds ON i.ImageID = prev_ds.image_id AND prev_ds.Date = DATE_SUB(ds.Date, INTERVAL 1 DAY)
//         ORDER BY i.EloScore DESC
//         LIMIT 10;
//     `;

//     // Execute the query
//     db.query(topRatedQuery, (err, results) => {
//         if (err) {
//             console.error(err);
//             return res.status(500).json({ error: 'Internal Server Error' });
//         }

//         res.json(results);
//     });
// });


app.get('/top-rated', (req, res) => {
    // Construct the SQL query to get the top 10 rated images with display names and rank changes
    const topRatedQuery = `
        SELECT i.ImageID, i.ImageURL, i.EloScore, u.display_name,prev_ds.rank,
            CASE
                WHEN prev_ds.rank IS NULL THEN 'New'
                WHEN ds.rank < prev_ds.rank THEN CONCAT('+', prev_ds.rank - ds.rank)
                WHEN ds.rank > prev_ds.rank THEN CONCAT(ds.rank - prev_ds.rank)
                ELSE '0'
            END AS rank_change
        FROM Images i
        JOIN Users u ON i.UserID = u.UserID
        JOIN DailyStatistics ds ON i.ImageID = ds.image_id AND ds.Date = (SELECT MAX(Date) FROM DailyStatistics WHERE image_id = i.ImageID)
        LEFT JOIN DailyStatistics prev_ds ON i.ImageID = prev_ds.image_id AND prev_ds.Date = DATE_SUB(ds.Date, INTERVAL 1 DAY)
        ORDER BY i.EloScore DESC
        LIMIT 10;
    `;

    // Execute the query
    db.query(topRatedQuery, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        res.json(results);
    });
});




app.put('/change-image/:userId', async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const { newImageUrl } = req.body;

    if (!newImageUrl) {
        return res.status(400).json({ error: 'New image URL is required' });
    }

    try {
        // Update the image URL in the database
        const updateQuery = 'UPDATE Images SET ImageURL = ? WHERE UserID = ?';
        db.query(updateQuery, [newImageUrl, userId], (error, results) => {
            if (error) {
                throw error;
            }

            // Check if any rows were affected (image updated successfully)
            if (results.affectedRows > 0) {
                res.json({ message: 'Image updated successfully' });
            } else {
                res.status(404).json({ error: 'User not found or image update failed' });
            }
        });
    } catch (error) {
        console.error('Error updating image:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.get('/view-image/:userId', (req: Request, res: Response) => {
    // Assuming you have user authentication in place, and you get the user ID from the authenticated user.
    const userId = req.params.userId;

    // Get the user's image list
    const getUserImagesQuery = `SELECT * FROM Images WHERE UserID = ? ORDER BY EloScore DESC`;
    db.query(getUserImagesQuery, [userId], (getUserImagesErr, userImages) => {
        if (getUserImagesErr) {
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        // Get the user's daily statistics
        // const getDailyStatsQuery = `SELECT * FROM DailyStatistics WHERE UserID = ? ORDER BY Date DESC LIMIT 2`;
        // db.query(getDailyStatsQuery, [userId], (getDailyStatsErr, dailyStats) => {
        //     if (getDailyStatsErr) {
        //         return res.status(500).json({ error: 'Internal Server Error' });
        //     }

        // Calculate ranking changes
        // const todayWins = dailyStats[0]?.Wins || 0;
        // const yesterdayWins = dailyStats[1]?.Wins || 0;
        // const rankingChange = todayWins - yesterdayWins;

        // Send the response with user images and ranking changes
        // res.json({ userImages, rankingChange });
        res.json({ userImages });
    });
});





const firebaseConfig = {
    apiKey: "AIzaSyDHM3guYBRRloid5lGpcmVe5ldCvBRh3uE",
    authDomain: "tripbookingbyjoe.firebaseapp.com",
    projectId: "tripbookingbyjoe",
    storageBucket: "tripbookingbyjoe.appspot.com",
    messagingSenderId: "52023133809",
    appId: "1:52023133809:web:797a8df9184a180419bdd0",
    measurementId: "G-H1JMHRNKPD"
};

// Initialize Firebase
initializeApp(firebaseConfig);

const storage = getStorage();

class FileMiddleware {
    // Attribute file name
    filename = "";

    // Create object of diskloader for saving file
    public readonly diskLoader = multer({
        // Storage = define folder (disk) to be saved 🙂
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 67108864, // 64 MByte
        },
    });

}


const fileUpload = new FileMiddleware();

app.post("/upload", fileUpload.diskLoader.single("123"), async (req, res) => {
    try {
        const filename = Date.now() + "-" + Math.round(Math.random() * 10000) + ".png";
        const storageRef = ref(storage, "/images/" + filename);
        const metadata = {
            contentType: req.file!.mimetype
        };

        const uploadTask = await uploadBytesResumable(storageRef, req.file!.buffer, metadata);
        const url = await getDownloadURL(uploadTask.ref);


        const insertQuery = 'INSERT INTO Images (UserID, ImageURL) VALUES (?, ?)';
        const ID = req.body.id;

        db.query(insertQuery, [ID, url], (err, result) => {
            if (err) {
                console.error('Error inserting into Images table:', err);
                res.status(500).json({ error: 'Internal server error' });
            } else {
                res.status(200).json({
                    file: url,
                });
            }
        });
    } catch (error) {
        console.error("Error uploading file:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



app.delete('/deleteImage/:imageId', async (req: Request, res: Response) => {
    const imageId = req.params.imageId;

    // Check if the image exists in the database
    const checkImageQuery = 'SELECT * FROM Images WHERE ImageID = ?';

    db.query(checkImageQuery, [imageId], async (checkErr, checkResults) => {
        if (checkErr) {
            console.error(checkErr);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        // If the image doesn't exist, return an error
        if (checkResults.length === 0) {
            return res.status(404).json({ error: 'Image not found' });
        }

        // Get the image URL from the database
        const imageUrl = checkResults[0].ImageURL;

        try {
            // Delete the image from Firebase Storage
            const storageRef = ref(storage, imageUrl);
            await deleteObject(storageRef);

            // Delete the image from the database
            const deleteQuery = 'DELETE FROM Images WHERE ImageID = ?';
            db.query(deleteQuery, [imageId], (deleteErr, result) => {
                if (deleteErr) {
                    console.error(deleteErr);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }

                res.json({ message: 'Image deleted successfully' });
            });
        } catch (error) {
            console.error('Error deleting image:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
});


app.post('/updateImage', fileUpload.diskLoader.single('123'), async (req, res) => {
    try {
        const imageId = req.body.imageId;
        const UserID = req.body.id

        // Check if the image exists in the database
        const checkImageQuery = 'SELECT * FROM Images WHERE ImageID = ?';

        db.query(checkImageQuery, [imageId], async (checkErr, checkResults) => {
            if (checkErr) {
                console.error(checkErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            // If the image doesn't exist, return an error
            if (checkResults.length === 0) {
                return res.status(404).json({ error: 'Image not found' });
            }

            // Get the current image URL from the database
            const currentImageUrl = checkResults[0].ImageURL;

            // Delete the current image from Firebase Storage
            const currentStorageRef = ref(storage, currentImageUrl);
            await deleteObject(currentStorageRef);

            // Upload the updated image to Firebase Storage
            const updatedFilename = Date.now() + '-' + Math.round(Math.random() * 10000) + '.png';
            const updatedStorageRef = ref(storage, '/images/' + updatedFilename);
            const metadata = {
                contentType: req.file!.mimetype
            };

            const uploadTask = await uploadBytesResumable(updatedStorageRef, req.file!.buffer, metadata);
            const updatedImageUrl = await getDownloadURL(uploadTask.ref);

            const deleteQuery = 'DELETE FROM Images WHERE ImageID = ?';
            db.query(deleteQuery, [imageId], (deleteErr, deleteResult) => {
                if (deleteErr) {
                    console.error(deleteErr);
                    return res.status(500).json({ error: 'Internal Server Error during deletion' });
                }

                // Now, insert the new image
                const insertQuery = 'INSERT INTO Images (ImageURL, EloScore, userID) VALUES (?, 1500, ?)';
                db.query(insertQuery, [updatedImageUrl, UserID], (insertErr, insertResult) => {
                    if (insertErr) {
                        console.error(insertErr);
                        return res.status(500).json({ error: 'Internal Server Error during insertion' });
                    }

                    res.status(200).json({
                        message: 'Image updated successfully',
                        file: updatedImageUrl,
                    });
                });
            });

        });
    } catch (error) {
        console.error('Error updating image:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Endpoint for uploading avatar
app.post('/uploadAvatar', fileUpload.diskLoader.single('123'), async (req, res) => {
    try {
        const userId = req.body.userId; // Assuming you pass the user ID in the request body
        const filename = Date.now() + '-' + Math.round(Math.random() * 10000) + '.png';
        const storageRef = ref(storage, '/avatars/' + filename);
        const metadata = {
            contentType: req.file!.mimetype,
        };

        const uploadTask = await uploadBytesResumable(storageRef, req.file!.buffer, metadata);
        const avatarURL = await getDownloadURL(uploadTask.ref);

        // Update the avatar URL in the database
        const updateQuery = 'UPDATE Users SET AvatarURL = ? WHERE UserID = ?';
        db.query(updateQuery, [avatarURL, userId], (updateErr, result) => {
            if (updateErr) {
                console.error(updateErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            res.status(200).json({
                message: 'Avatar uploaded and URL updated successfully',
                avatarURL,
            });
        });
    } catch (error) {
        console.error('Error uploading avatar:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// app.get('/imageStatistics/:imageId', (req: Request, res: Response) => {
//     const imageId = req.params.imageId;

//     // Fetch daily statistics for the last 7 days based on ImageID
//     const query = `
//         SELECT *
//         FROM DailyStatistics
//         WHERE image_id = ? AND Date >= CURDATE() - INTERVAL 6 DAY
//         ORDER BY Date DESC
//     `;

//     db.query(query, [imageId], (err, results) => {
//         if (err) {
//             console.error(err);
//             return res.status(500).json({ error: 'Internal Server Error' });
//         }

//         res.json(results);
//     });
// });


app.get('/image-stats/:imageId', (req, res) => {
    const imageId = req.params.imageId;

    // Construct the SQL query to get the statistics for the past 7 days of the image
    const statsQuery = `
        SELECT DATE(ds.Date) AS date, MAX(ds.EloScore) AS eloScore, MAX(ds.\`rank\`) AS \`rank\`,
            MAX(CASE 
                WHEN ds.\`rank\` < prev_ds.\`rank\` THEN prev_ds.\`rank\` - ds.\`rank\`
                ELSE 0
            END) AS rank_up,
            MAX(CASE 
                WHEN ds.\`rank\` > prev_ds.\`rank\` THEN ds.\`rank\` - prev_ds.\`rank\`
                ELSE 0
            END) AS rank_down
        FROM DailyStatistics ds
        LEFT JOIN DailyStatistics prev_ds ON ds.image_id = prev_ds.image_id AND prev_ds.Date = DATE_SUB(ds.Date, INTERVAL 1 DAY)
        WHERE ds.image_id = ?
            AND ds.Date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY DATE(ds.Date), ds.Date
        ORDER BY ds.Date;
    `;

    // Execute the query
    db.query(statsQuery, [imageId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        // Prepare the data for the graph
        const graphData = results.map((row: { date: any; eloScore: any; rank: any; rank_up: any; rank_down: any; }) => ({
            date: row.date,
            eloScore: row.eloScore,
            rank: row.rank,
            rankUp: row.rank_up,
            rankDown: row.rank_down,
        }));

        res.json(graphData);
    });
});

app.listen(3000, () => console.log('Server ready on port 3000.'));

export default app;
